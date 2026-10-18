/// <reference types="vite-plugin-pwa/react" />
// 让 tsc 认识 `virtual:pwa-register/react`（vite-plugin-pwa 的虚拟模块类型）。
// tsconfig 的 types 数组只能写包名，解析不到子路径，所以用 reference。
