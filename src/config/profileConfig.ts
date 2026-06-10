import type { ProfileConfig } from "../types/config";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	avatar: "assets/images/头像&Icon.jpg",

	// 名字
	name: "石磨豆浆",

	// 个人签名
	bio: "充满鲜花的世界到底在哪里",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	links: [
		{
			name: "Bilibili个人",
			icon: "simple-icons:bilibili",
			url: "https://space.bilibili.com/525320206",
			showName: false,
		},
		{
			name: "Bilibili发布",
			icon: "simple-icons:bilibili",
			url: "https://space.bilibili.com/3707003943782976",
			showName: false,
		},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/smdjzzz",
			showName: false,
		},
		{
			name: "Gitee",
			icon: "fa7-brands:gitee",
			url: "https://gitee.com/smdjzzz",
			showName: false,
		},
		{
			name: "博客园",
			icon: "fa7-solid:rss",
			url: "https://www.cnblogs.com/smdj",
			showName: false,
		},
	],
};
