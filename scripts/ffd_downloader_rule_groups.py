#!/usr/bin/env python3
"""
Compatibility wrapper for the official FFD downloader.

The packaged downloader currently reads the legacy flat config fields for
matching. This wrapper teaches it to honor rule_groups, exclude keywords,
recent_days, and max_files before any file is downloaded.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import argparse
import time
from datetime import date
from pathlib import Path
from typing import Dict, Iterable


OFFICIAL_DOWNLOADER = Path("/usr/local/share/ffd-downloader/ffd_downloader.py")

DEPTH_TERMS = [
    "深度",
    "专题",
    "产业链",
    "框架",
    "梳理",
    "跟踪",
]

MEMORY_DEPTH_TERMS = DEPTH_TERMS + [
    "周期",
]

EXTRA_EXCLUDE_TERMS = [
    "每日晨会",
    "晨会",
    "早会",
    "日评",
    "短评",
    "快评",
    "点评",
    "周报",
    "策略周报",
    "评级快评",
    "泛AI",
    "首次覆盖",
    "招股书",
    "纪要",
]

WATCHLIST_COMPANIES = [
    "拓荆科技",
    "东山精密",
    "绿的谐波",
    "中际旭创",
    "新易盛",
]

EVIDENCE_TERMS = [
    "客户",
    "订单",
    "产能",
    "毛利率",
    "良率",
    "验证",
    "导入",
    "定点",
    "放量",
    "风险",
]

ARCHIVE_ROOT = Path.home() / "Desktop" / "FFD研报库"
ARCHIVE_CATEGORIES = {
    "ai-optical-pcb-packaging": "01_AI光互连_AI_PCB_先进封装",
    "semi-equipment-materials": "02_半导体设备_材料国产替代",
    "humanoid-robot-actuator": "03_人形机器人_执行器瓶颈",
    "watchlist-direct-validation": "04_Watchlist公司验证",
    "memory-chips-hbm-dram-nand": "05_存储芯片_HBM_DRAM_NAND",
    "other-review": "90_待复核_其他",
}


def load_official_downloader():
    spec = importlib.util.spec_from_file_location("ffd_official_downloader", OFFICIAL_DOWNLOADER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load official downloader from {OFFICIAL_DOWNLOADER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_official_downloader()
official_collect_matching = base.collect_matching
official_download_file = base.FFDClient.download_file
METADATA_BY_FILE_ID: dict[int, dict] = {}
CATEGORIES_BY_FILE_ID: dict[int, set[str]] = {}


def as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(as_text(item) for item in value)
    if isinstance(value, dict):
        return " ".join(as_text(item) for item in value.values())
    return str(value)


def file_text(finfo: dict) -> str:
    fields = [
        "file_name",
        "organization",
        "industry",
        "category_name",
        "en_title",
        "summary",
        "tags",
        "description",
    ]
    return " ".join(as_text(finfo.get(field)) for field in fields)


def contains_any(text: str, terms: Iterable[str]) -> bool:
    lower = text.lower()
    return any(term and term.lower() in lower for term in terms)


def publish_within_recent_days(finfo: dict, recent_days: int | None) -> bool:
    if not recent_days:
        return True
    publish_date = as_text(finfo.get("publish_date")).strip()
    if not publish_date:
        return False
    try:
        published = date.fromisoformat(publish_date[:10])
    except ValueError:
        return False
    return (date.today() - published).days <= int(recent_days)


def matches_organization(finfo: dict, organizations: list[str]) -> bool:
    if not organizations:
        return True
    actual = as_text(finfo.get("organization")).strip()
    return actual in organizations


def matches_industry(finfo: dict, industries: list[str]) -> bool:
    if not industries:
        return True
    actual = as_text(finfo.get("industry")).strip()
    return any(item == actual or item in actual or actual in item for item in industries)


def matches_category(finfo: dict, category_codes: list[str]) -> bool:
    if not category_codes:
        return True
    code = as_text(finfo.get("category_code")).strip()
    name = as_text(finfo.get("category_name")).strip()
    return code in category_codes or name in category_codes


def is_watchlist_group(group: dict) -> bool:
    name = as_text(group.get("name"))
    keywords = [as_text(item) for item in group.get("keywords") or []]
    return "watchlist" in name.lower() or contains_any(" ".join(keywords), WATCHLIST_COMPANIES)


def is_memory_group(group: dict) -> bool:
    name = as_text(group.get("name"))
    keywords = [as_text(item) for item in group.get("keywords") or []]
    text = f"{name} {' '.join(keywords)}"
    return contains_any(text, ["存储", "DRAM", "NAND", "HBM", "Memory", "内存", "闪存"])


def matches_watchlist_quality(text: str) -> bool:
    return contains_any(text, WATCHLIST_COMPANIES) and (
        contains_any(text, EVIDENCE_TERMS) or contains_any(text, DEPTH_TERMS)
    )


def matches_thematic_quality(text: str, group: dict) -> bool:
    keywords = [as_text(item) for item in group.get("keywords") or []]
    depth_terms = MEMORY_DEPTH_TERMS if is_memory_group(group) else DEPTH_TERMS
    return contains_any(text, keywords) and contains_any(text, depth_terms)


def file_matches_group(finfo: dict, group: dict) -> bool:
    text = file_text(finfo)
    exclude_terms = list(group.get("exclude_keywords") or []) + EXTRA_EXCLUDE_TERMS

    if contains_any(text, exclude_terms):
        return False
    if not publish_within_recent_days(finfo, group.get("recent_days")):
        return False
    if not matches_organization(finfo, list(group.get("organizations") or [])):
        return False
    if not matches_industry(finfo, list(group.get("industries") or [])):
        return False
    if not matches_category(finfo, list(group.get("category_codes") or [])):
        return False

    if is_watchlist_group(group):
        return matches_watchlist_quality(text)
    return matches_thematic_quality(text, group)


def sort_key(finfo: dict) -> str:
    return as_text(finfo.get("publish_date") or finfo.get("uploaded_at"))


def group_category_id(group: dict) -> str:
    name = as_text(group.get("name"))
    text = f"{name} {' '.join(as_text(item) for item in group.get('keywords') or [])}"
    if is_watchlist_group(group):
        return "watchlist-direct-validation"
    if (
        "存储" in text
        or "DRAM" in text
        or "NAND" in text
        or "HBM" in text
        or "Memory" in text
        or "内存" in text
        or "闪存" in text
    ):
        return "memory-chips-hbm-dram-nand"
    if "机器人" in text or "执行器" in text:
        return "humanoid-robot-actuator"
    if "半导体设备" in text or "国产替代" in text or "ALD" in text or "CVD" in text:
        return "semi-equipment-materials"
    if "CPO" in text or "光模块" in text or "AI PCB" in text or "先进封装" in text:
        return "ai-optical-pcb-packaging"
    return "other-review"


def safe_archive_filename(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip()
    return name or "untitled"


def safe_download_filename(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip()
    if not name:
        name = "untitled.pdf"

    suffix = Path(name).suffix
    if not suffix:
        name = f"{name}.pdf"
        suffix = ".pdf"

    if len(name) > 200:
        stem = Path(name).stem
        name = f"{stem[: max(1, 200 - len(suffix))]}{suffix}"

    return name


def ensure_archive_dirs():
    for dirname in ARCHIVE_CATEGORIES.values():
        (ARCHIVE_ROOT / dirname).mkdir(parents=True, exist_ok=True)


def relative_symlink_target(source: Path, dest: Path) -> str:
    return os.path.relpath(source, dest.parent)


def create_archive_link(source: Path, category_id: str):
    dirname = ARCHIVE_CATEGORIES.get(category_id) or ARCHIVE_CATEGORIES["other-review"]
    dest_dir = ARCHIVE_ROOT / dirname
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / safe_archive_filename(source.name)
    if dest.exists() or dest.is_symlink():
        try:
            if dest.is_symlink() and dest.resolve() == source.resolve():
                return
        except Exception:
            pass
        dest = dest_dir / f"{source.stem}_id{abs(hash(str(source))) % 100000}{source.suffix}"
    try:
        dest.symlink_to(relative_symlink_target(source, dest))
    except Exception as exc:
        base.log.warning(f"  创建桌面分类入口失败: {dest}: {exc}")


def collect_matching_with_rule_groups(client, config: dict) -> Dict[int, dict]:
    groups = [group for group in (config.get("rule_groups") or []) if group.get("enabled", True)]
    if not groups:
        base.log.info("  未发现 rule_groups, 使用官方扁平筛选")
        return official_collect_matching(client, config)

    result: Dict[int, dict] = {}
    for index, group in enumerate(groups, start=1):
        name = as_text(group.get("name")) or f"规则组 {index}"
        base.log.info(f"  规则组 {index}: {name}")

        query_group = dict(group)
        if is_watchlist_group(group):
            company_terms = [term for term in WATCHLIST_COMPANIES if term in group.get("keywords", [])]
            query_group["keywords"] = company_terms or WATCHLIST_COMPANIES
            base.log.info(f"    Watchlist 后端查询仅使用公司名: {query_group['keywords']}")

        raw_matches = official_collect_matching(client, query_group)
        filtered = [finfo for finfo in raw_matches.values() if file_matches_group(finfo, group)]
        filtered.sort(key=sort_key, reverse=True)

        max_files = group.get("max_files")
        if max_files:
            filtered = filtered[: int(max_files)]

        base.log.info(f"    二次过滤后 {len(filtered)} 个候选")
        category_id = group_category_id(group)
        for finfo in filtered:
            file_id = int(finfo["file_id"])
            METADATA_BY_FILE_ID[file_id] = finfo
            CATEGORIES_BY_FILE_ID.setdefault(file_id, set()).add(category_id)
            result[finfo["file_id"]] = finfo

    base.log.info(f"  规则组合并后 {len(result)} 个候选")
    return result


def write_metadata_sidecar(save_path: Path, finfo: dict):
    sidecar_path = Path(f"{save_path}.ffd-meta.json")
    try:
        with open(sidecar_path, "w", encoding="utf-8") as f:
            json.dump(finfo, f, ensure_ascii=False, indent=2)
            f.write("\n")
    except Exception as exc:
        base.log.warning(f"  写元数据 sidecar 失败: {exc}")


def download_file_with_sidecar(self, file_id: int, save_path: Path) -> bool:
    ok = official_download_file(self, file_id, save_path)
    if ok and file_id in METADATA_BY_FILE_ID:
        write_metadata_sidecar(save_path, METADATA_BY_FILE_ID[file_id])
    if ok:
        ensure_archive_dirs()
        categories = CATEGORIES_BY_FILE_ID.get(file_id) or {"other-review"}
        for category_id in categories:
            create_archive_link(save_path, category_id)
    return ok


base.collect_matching = collect_matching_with_rule_groups
base.FFDClient.download_file = download_file_with_sidecar
base.safe_filename = safe_download_filename


def run_sync_once_with_status(client, save_root: Path, state: set[int]) -> bool:
    try:
        poll_result = client.poll_sync_pending()
    except Exception as exc:
        base.log.error(f"轮询失败: {exc}")
        return False

    try:
        result = base.do_sync(client, save_root, state, poll_result)
        client.report_sync(**result)
        return True
    except Exception as exc:
        base.log.error(f"同步异常: {exc}")
        try:
            client.report_sync(sync_count=0, message=f"客户端异常: {exc}")
        except Exception:
            pass
        return False


def main():
    parser = argparse.ArgumentParser(description="FFD 自动下载客户端，支持规则组与定时全量重试")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--sync-now", action="store_true", help="立即同步一次后退出")
    parser.add_argument("--bind-code", help="用网页绑定码绑定本机并写入配置")
    parser.add_argument("--server-url", default="https://ffd.findesk.cn", help="FFD 服务地址")
    args = parser.parse_args()

    if args.bind_code:
        base.bind_with_code(args.server_url, args.bind_code)
        return

    base.setup_logging(args.verbose)
    cfg = base.load_config()
    state = base.load_state()
    save_root = Path(cfg["save_dir"]).expanduser()
    save_root.mkdir(parents=True, exist_ok=True)

    base.log.info("=" * 60)
    base.log.info("FFD Downloader 启动")
    base.log.info(f"  保存目录: {save_root}")
    base.log.info(f"  服务器: {cfg['server_url']}")
    base.log.info(f"  已下载记录: {len(state)} 个文件")
    base.log.info("=" * 60)

    client = base.FFDClient(cfg)
    poll_interval = cfg.get("poll_interval_seconds", 60)
    full_sync_interval = int(cfg.get("full_sync_interval_seconds") or 6 * 60 * 60)

    try:
        base.log.info("启动时同步...")
        startup_ok = run_sync_once_with_status(client, save_root, state)

        if args.sync_now:
            base.log.info("--sync-now 完成, 退出")
            return

        retry_delay = min(300, full_sync_interval)
        next_full_sync = time.monotonic() + (full_sync_interval if startup_ok else retry_delay)
        base.log.info(f"进入轮询模式, 每 {poll_interval}s 检查 sync_pending; 每 {full_sync_interval}s 定时全量同步")
        while True:
            try:
                time.sleep(poll_interval)
                poll_result = client.poll_sync_pending()
                now = time.monotonic()
                should_periodic_sync = now >= next_full_sync
                if poll_result.get("pending") or should_periodic_sync:
                    if poll_result.get("pending"):
                        base.log.info("收到 [立即同步] 触发!")
                    else:
                        base.log.info("定时全量同步触发")
                    result = base.do_sync(client, save_root, state, poll_result)
                    client.report_sync(**result)
                    next_full_sync = time.monotonic() + full_sync_interval
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                base.log.warning(f"轮询出错(继续): {exc}")
    except KeyboardInterrupt:
        base.log.info("收到 Ctrl-C, 退出")
    finally:
        client.close()
        base.log.info("FFD Downloader 已退出")


if __name__ == "__main__":
    main()
