FROM node:24-slim

RUN npm install -g pnpm

RUN apt-get update && apt-get install -y \
    sudo \
    git \
    procps \
    curl \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI (gh) を公式 apt リポジトリからインストール
RUN apt-get update && apt-get install -y gnupg ca-certificates \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

RUN echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

RUN mkdir -p /home/node/.claude && chown -R node:node /home/node/.claude
