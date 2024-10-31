---
nav:
  title: 指南
  order: 2
group:
  title: 开始
order: 5
---

# 参与贡献

如果你愿意帮助改进 WebAV 项目，在此先向勇士致以崇高的敬意🫡。

欢迎任何有助项目发展的贡献，包括但不限于

- 社区互助解答 Issues
- 文档：优化项目站点、API 文档、翻译
- 代码：Bugfix、新功能、单元测试
- 资金赞助

新增/改动 API 或有大量代码改动的 bugfix，开始前务必先与项目维护者在 issue 中讨论，浪费勇士们的时间是莫大的罪过。

---

**文档、代码**贡献请阅读下文内容

## 运行项目

1. clone 当前项目到本地
2. 在根目录下执行 `pnpm install && pnpm build`
3. cd 跳转到特定 package (假设为 av-cliper)，运行 `pnpm dev`
4. path 为 DEMO 目录下的文件名，如 `concat-media.html`
5. 在浏览器中打开 DEMO URL，如 `http://localhost:6066/concat-media.html`
6. `pnpm test` 运行该 package 的单元测试

## 运行 WebAV 站点

1. clone 当前项目到本地
2. 在根目录下执行 `pnpm install && pnpm build`
3. cd 跳转到 `doc-site` 目录，执行 `pnpm dev`
4. 根据终端提示，访问指定 URL

启动本地站点能更流畅地体验 DEMO，站点还包含更多的示例可用于测试功能是否正常。

## Commit 规范

Commit message 格式规范请了解 [Angular's commit convention](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-angular)。

## 代码规范

1. 本项目使用 prettier 格式化代码，请安装 prettier 插件，避免代码样式冲突，或格式化对 PR 代码产生干扰。
2. 提交 PR 前务必运行单元测试（后续会在工作流中加入自动校验）

## 项目工作流

本项目使用 [changesets](https://github.com/changesets/changesets) 管理并自动发布版本；

### 代码贡献

在 commit 之后需执行以下步骤生成描述文件

1. 在你的分支执行 `pnpm changeset add`
2. 选择代码影响的 package 范围，以及版本变更规则（`major, minor, patch`）
   按**空格**选中，按**回车**确认

_PS: 文档更新，不涉及版本号变更可忽略此步骤_

### 版本发布

只有项目维护者有权限发布版本，贡献者按 changeset 规则创建描述文件后发起 PR；  
维护者合并 PR 后 Github Actions 会自动发布版本。

### 发布 beta 版本

需项目维护者手动操作

1. prerelease 模式 `pnpm changeset pre enter beta`
2. 生成描述文件 `pnpm changeset add`
3. 消费描述文件升级版本 `pnpm changeset version`
4. 发布 npm next tag `pnpm publish:all:next`
5. 退出 prerelease 模式 `pnpm changeset pre exit`
