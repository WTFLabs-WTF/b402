import type { PresetTokenConfig } from "./types";

/**
 * EIP-3009 方法签名
 * - transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
 *
 * 支持多个方法签名变体，以兼容不同的实现：
 * - 0xe3ee160e: 标准 EIP-3009 实现
 * - 0xcf092995: 某些代币的替代实现
 */
export const EIP3009_SIGNATURES = ["0xe3ee160e", "0xcf092995"] as const;

/**
 * EIP-2612 Permit 方法签名
 * - permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
 */
export const EIP2612_PERMIT = "0xd505accf" as const;

/**
 * Uniswap Permit2 合约地址（所有链相同）
 */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * EIP-1967 标准实现槽位
 * keccak256("eip1967.proxy.implementation") - 1
 */
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/**
 * EIP-1822 UUPS 实现槽位
 * keccak256("PROXIABLE")
 */
export const EIP1822_IMPLEMENTATION_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as const;

/**
 * 预设 Token 配置
 * 用于已知的特殊 Token，避免重复检测
 */
export const PRESET_TOKEN_CAPABILITIES: Record<string, PresetTokenConfig> = {
  // World Liberty Financial USD - 只支持 permit
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": {
    supportedMethods: ["permit"],
    supportedNetworks: [56], // BSC
    description: "World Liberty Financial USD (WLFI)",
  },
  // 可以继续添加更多预设代币
  // 示例：
  // "0x其他代币地址": {
  //   supportedMethods: ["eip3009", "permit"],
  //   supportedNetworks: [1, 56],
  //   description: "代币名称",
  // },
};

