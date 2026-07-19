# ADR-010: Shell 文件写入绕过防护

**分类：** 安全架构

| 维度 | 内容 |
|------|------|
| **问题** | `write`/`edit` 工具有路径保护，但 `sed -i`、`echo >`、`tee`、`cp`、`mv`、`cat >`、`dd of=`、`awk -i`、`truncate` 等 10 种 shell 命令可以直接修改文件，绕过 `write`/`edit` 工具的路径保护。 |
| **决策** | 将 shell 文件修改统一纳入受限 shell analysis、command taxonomy 和 canonical path policy。`sed -i`、`echo >`、`tee`、`cp`、`mv`、`cat >`、`dd of=`、`awk -i`、`truncate` 等写入 intent 经过同一套 hard/path/config gate；secret-pattern scan 不作为访问控制或防泄露机制，已从 runtime 移除。不能只依赖 built-in `write`/`edit` 的路径保护。 |
| **理由** | 纵深防御——路径保护必须覆盖所有文件修改入口，不能仅依赖工具级拦截。Shell 命令是最大的盲区。 |
| **后果** | `sed -i .env`、`echo "k=v" > .env`、`tee .env`、`cp /tmp/x .env` 等常见 shell 绕过路径会进入统一 path policy；critical、unsafe syntax、dynamic execution 和 immutable path deny 不受 config allow 影响。 |
