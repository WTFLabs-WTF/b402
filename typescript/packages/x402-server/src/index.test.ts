/**
 * 基础测试 - x402x-server
 */

import { describe, it, expect, beforeAll } from "vitest";
import { X402Server } from "./server";
import { Facilitator } from "x402x-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

describe("X402Server", () => {
  let server: X402Server;
  const USDC = "0x25d066c4C68C8A6332DfDB4230263608305Ca991";

  beforeAll(() => {
    const client = createPublicClient({
      chain: bscTestnet,
      transport: http(),
    });

    const facilitator = new Facilitator({
      recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
    });

    server = new X402Server({
      client,
      facilitator,
    });
  });

  describe("Constructor", () => {
    it("should create server instance", () => {
      expect(server).toBeDefined();
    });

    it("should throw error if client is missing", () => {
      const facilitator = new Facilitator({
        recipientAddress: "0x123",
      });

      expect(() => {
        // @ts-expect-error - Testing missing client
        new X402Server({ facilitator });
      }).toThrow("client is required");
    });

    it("should throw error if facilitator is missing", () => {
      const client = createPublicClient({
        chain: bscTestnet,
        transport: http(),
      });

      expect(() => {
        // @ts-expect-error - Testing missing facilitator
        new X402Server({ client });
      }).toThrow("facilitator is required");
    });
  });

  describe("createRequirements", () => {
    it("should create payment requirements with auto-detect", async () => {
      const requirements = await server.createRequirements({
        asset: USDC,
        maxAmountRequired: "1000",
        network: "bsc",
      });

      expect(requirements).toBeDefined();
      expect(requirements.scheme).toBe("exact");
      expect(requirements.maxAmountRequired).toBe("1000");
      expect(requirements.asset).toBe(USDC);
      expect(requirements.paymentType).toBeDefined();
    }, 10000);

    it("should create requirements with manual paymentType", async () => {
      const requirements = await server.createRequirements({
        asset: USDC,
        maxAmountRequired: "1000",
        paymentType: "permit",
        autoDetect: false,
        network: "bsc",
      });

      expect(requirements.paymentType).toBe("permit");
      expect(requirements.extra?.name).toBeUndefined();
      expect(requirements.extra?.version).toBeUndefined();
    });

    it("should throw error if autoDetect is false without paymentType", async () => {
      await expect(
        server.createRequirements({
          asset: USDC,
          maxAmountRequired: "1000",
          autoDetect: false,
          network: "bsc",
        }),
      ).rejects.toThrow("Must specify paymentType when autoDetect is false");
    });
  });

  describe("parse", () => {
    it("should return 402 if payment header is missing", async () => {
      const requirements = await server.createRequirements({
        asset: USDC,
        maxAmountRequired: "1000",
        autoDetect: false,
        paymentType: "permit",
        network: "bsc",
      });

      const result = server.parse(undefined, requirements);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response402.error).toBe("missing_payment_header");
      }
    });

    it("should return 402 if payment header is invalid", async () => {
      const requirements = await server.createRequirements({
        asset: USDC,
        maxAmountRequired: "1000",
        autoDetect: false,
        paymentType: "permit",
        network: "bsc",
      });

      const result = server.parse("invalid-base64", requirements);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response402.error).toBe("invalid_payment_header");
      }
    });
  });

  describe("get402Response", () => {
    it("should generate 402 response", async () => {
      const requirements = await server.createRequirements({
        asset: USDC,
        maxAmountRequired: "1000",
        autoDetect: false,
        paymentType: "permit",
        network: "bsc",
      });

      const response = server.get402Response(requirements, "test_error");

      expect(response.x402Version).toBe(1);
      expect(response.accepts).toHaveLength(1);
      expect(response.accepts[0]).toBe(requirements);
      expect(response.error).toBe("test_error");
    });
  });

  describe("Cache management", () => {
    it("should clear specific token cache", async () => {
      await server.clearCache(USDC);
      const stats = server.getCacheStats();
      expect(stats).toBeDefined();
    });

    it("should clear all cache", async () => {
      await server.clearCache();
      const stats = server.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it("should get cache stats", () => {
      const stats = server.getCacheStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("keys");
      expect(Array.isArray(stats.keys)).toBe(true);
    });
  });
});
