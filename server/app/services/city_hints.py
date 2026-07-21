"""Generate city-aware placeholder copy via AI API or local fallback."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.city_hints import CityHintsResponse

logger = logging.getLogger("travel_planner.city_hints")

# 常用城市本地回退（未配置 AI 或调用失败时使用）
_FALLBACK_LANDMARKS: dict[str, tuple[str, str]] = {
    "西安": ("例如：西安城墙", "例如：兵马俑 / 陕西历史博物馆"),
    "成都": ("例如：宽窄巷子", "例如：大熊猫基地 / 锦里"),
    "北京": ("例如：故宫博物院", "例如：天安门 / 颐和园"),
    "上海": ("例如：外滩", "例如：东方明珠 / 豫园"),
    "杭州": ("例如：西湖断桥", "例如：灵隐寺 / 西溪湿地"),
    "重庆": ("例如：洪崖洞", "例如：磁器口 / 解放碑"),
    "广州": ("例如：珠江夜游", "例如：陈家祠 / 白云山"),
    "深圳": ("例如：世界之窗", "例如：莲花山 / 大鹏所城"),
    "南京": ("例如：夫子庙", "例如：中山陵 / 玄武湖"),
    "苏州": ("例如：拙政园", "例如：寒山寺 / 平江路"),
    "厦门": ("例如：鼓浪屿", "例如：南普陀 / 曾厝垵"),
    "昆明": ("例如：翠湖公园", "例如：石林 / 滇池"),
    "大理": ("例如：洱海骑行", "例如：古城南门 / 喜洲"),
    "丽江": ("例如：丽江古城", "例如：玉龙雪山 / 束河古镇"),
}


def fallback_hints(city: str) -> CityHintsResponse:
    """Deterministic placeholders when AI is unavailable."""
    city_name = city.strip()
    pair = _FALLBACK_LANDMARKS.get(city_name)
    if pair is None:
        # 去掉末尾「市」再试一次
        pair = _FALLBACK_LANDMARKS.get(city_name.removesuffix("市"))
    if pair is not None:
        title, search = pair
    else:
        title = f"例如：{city_name}热门景点"
        search = f"例如：{city_name}地标 / 博物馆"
    return CityHintsResponse(
        city_name=city_name,
        title_placeholder=title,
        search_placeholder=search,
        source="fallback",
    )


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _normalize_ai_payload(city: str, data: dict[str, Any]) -> CityHintsResponse | None:
    title = data.get("title_placeholder")
    search = data.get("search_placeholder")
    if not isinstance(title, str) or not isinstance(search, str):
        return None
    title = title.strip()
    search = search.strip()
    if not title or not search:
        return None
    if not title.startswith("例如"):
        title = f"例如：{title}"
    if not search.startswith("例如"):
        search = f"例如：{search}"
    return CityHintsResponse(
        city_name=city.strip(),
        title_placeholder=title,
        search_placeholder=search,
        source="ai",
    )


async def generate_city_hints(city: str) -> CityHintsResponse:
    """Call OpenAI-compatible chat API; fall back locally on any failure."""
    city_name = city.strip()
    if not city_name:
        return fallback_hints("未知城市")

    settings = get_settings()
    base = settings.ai_api_base_url.strip().rstrip("/")
    key = settings.ai_api_key.strip()
    model = settings.ai_model.strip()

    if not base or not key or not model:
        return fallback_hints(city_name)

    url = f"{base}/chat/completions"
    prompt = (
        f"你是旅游文案助手。针对中国城市「{city_name}」，生成两个中文占位提示，严格输出 JSON：\n"
        '{"title_placeholder":"例如：xxx","search_placeholder":"例如：A / B"}\n'
        "要求：\n"
        "1. title_placeholder 是日程事项标题示例，一个真实著名景点或地标；\n"
        "2. search_placeholder 是地点搜索示例，两个真实地标，用「 / 」分隔；\n"
        "3. 内容必须与该城市强相关，不要编造不存在的景点；\n"
        "4. 只输出 JSON，不要其它文字。"
    )

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你只输出合法 JSON 对象。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        if response.status_code != 200:
            logger.warning("AI city hints HTTP %s", response.status_code)
            return fallback_hints(city_name)

        payload = response.json()
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if not isinstance(choices, list) or not choices:
            return fallback_hints(city_name)
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            return fallback_hints(city_name)

        parsed = _extract_json_object(content)
        if parsed is None:
            return fallback_hints(city_name)
        normalized = _normalize_ai_payload(city_name, parsed)
        return normalized if normalized is not None else fallback_hints(city_name)
    except Exception:
        logger.exception("AI city hints failed for city=%s", city_name)
        return fallback_hints(city_name)
