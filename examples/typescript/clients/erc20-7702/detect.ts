import { bsc } from "viem/chains";
import {
  http,
  createPublicClient,
} from "viem";
import { exact } from "@wtflabs/x402/schemes";

const PROVIDER_URL = process.env.PROVIDER_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

const client = createPublicClient({
  chain: bsc,
  transport: http(),
});


const result = await exact.evm.detectTokenPaymentMethods(
  "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d",
  client,
)

console.log(result);

