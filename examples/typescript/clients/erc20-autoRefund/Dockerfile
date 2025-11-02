# 使用 Node.js 20 LTS 版本
FROM node:20-alpine

# 安装 pnpm 和 Python（用于编译 better-sqlite3）
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

# 设置工作目录
WORKDIR /app

# 复制根目录配置文件（只复制存在的）
COPY package.json pnpm-lock.yaml /app/

# 复制 examples/typescript 目录结构
COPY examples/typescript/package.json /app/examples/typescript/
COPY examples/typescript/pnpm-lock.yaml /app/examples/typescript/
COPY examples/typescript/pnpm-workspace.yaml /app/examples/typescript/

# 复制 TypeScript 包目录
COPY typescript/package.json /app/typescript/
COPY typescript/pnpm-lock.yaml /app/typescript/
COPY typescript/pnpm-workspace.yaml /app/typescript/
COPY typescript/packages /app/typescript/packages/
COPY typescript/tsconfig.base.json /app/typescript/

# 复制当前项目目录
COPY examples/typescript/clients/erc20-autoRefund /app/examples/typescript/clients/erc20-autoRefund/

# 安装依赖（从 examples/typescript 目录）
RUN cd /app/examples/typescript && pnpm install --frozen-lockfile

# 设置工作目录到项目目录
WORKDIR /app/examples/typescript/clients/erc20-autoRefund

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 4025

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4025/payments', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["pnpm", "run", "resource"]

