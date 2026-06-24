/**
 * 文件类型检测工具
 *
 * 设计目的:
 * - 通过文件扩展名自动判断文件类型 (log/image/pcap/other)
 * - 支持中英文文件名
 * - 为索引中的 fileTypes 汇总提供数据
 */

import type { FileType } from "../types/entry.js";

/** 扩展名 → 文件类型的映射表 */
const EXT_MAP: Record<string, FileType> = {
  // 日志文件
  ".log": "log",
  ".txt": "log",
  ".out": "log",

  // 图片文件
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".bmp": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",

  // PCAP 文件
  ".pcap": "pcap",
  ".pcapng": "pcap",
  ".cap": "pcap",

  // 其它
  ".zip": "other",
  ".tar": "other",
  ".gz": "other",
  ".7z": "other",
  ".pdf": "other",
  ".csv": "other",
  ".json": "other",
  ".xml": "other",
  ".html": "other",
  ".md": "other",
  ".yaml": "other",
  ".yml": "other",
};

/** MIME 类型映射 */
const MIME_MAP: Record<string, string> = {
  ".log": "text/plain",
  ".txt": "text/plain",
  ".out": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pcap": "application/vnd.tcpdump.pcap",
  ".pcapng": "application/vnd.tcpdump.pcap",
  ".cap": "application/vnd.tcpdump.pcap",
  ".json": "application/json",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".7z": "application/x-7z-compressed",
  ".html": "text/html",
  ".md": "text/markdown",
};

/**
 * 通过文件名检测文件类型
 */
export function detectFileType(filename: string): FileType {
  const ext = getExtension(filename).toLowerCase();
  return EXT_MAP[ext] ?? "other";
}

/**
 * 通过文件名获取 MIME 类型
 */
export function detectMimeType(filename: string): string {
  const ext = getExtension(filename).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

/**
 * 提取文件扩展名（含点号，小写）
 * 支持中文文件名: "抓包结果.PCAP" → ".pcap"
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot);
}

/**
 * 判断文件是否为大文件（适合用 Git LFS 管理）
 * 阈值: > 1MB 建议用 LFS
 */
export function isLargeFile(size: number): boolean {
  return size > 1024 * 1024; // 1MB
}

/**
 * 判断文件类型是否适合用 LFS 管理
 */
export function shouldUseLfs(filename: string): boolean {
  const ext = getExtension(filename).toLowerCase();
  return [".pcap", ".pcapng", ".png", ".jpg", ".jpeg", ".bmp", ".zip", ".tar.gz", ".7z"].includes(ext);
}
