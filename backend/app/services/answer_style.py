"""Shared answer-style guidance and approved platform facts.

Appended to every conversational system prompt (general + specialist agents) so answers read like
a top-tier assistant (ChatGPT / Gemini style): direct, complete, well structured, never negative
or refusing when the topic is a normal knowledge question.
"""

PLATFORM_FACTS = """Approved facts you may state confidently when asked (do not add anything beyond these):
- Ardhnarishwar Solver is the AI assistant of the Ardhnarishwar job portal, built by Recruweb Resources Pvt. Ltd.
- Ardhnarishwar job portal: https://ardhnarishwar-job-portal.recruweb.com/ - an AI-powered job portal with an AI Resume/ATS Scanner, a Professional CV Builder, AI Video Interview Practice with feedback, and Job Discovery tools. ("Ardhanarishwar" is the same product spelled differently; it is not about the deity.)
- Recruweb Resources Pvt. Ltd. is an HR and recruitment services company in Noida, India. Website: https://recruweb.com/
- Recruweb address: Office No. 1, Basement, H-169, Hazratpur Wajidpur, D Block, Sector 63, Noida, Uttar Pradesh 201301. Phone: 093365 32636. Business hours: open until 6:30 pm (check the website for full hours).
- Recruweb services for companies: IT and non-IT recruitment, HR outsourcing and consulting, talent pipeline building, employer branding, contract and permanent staffing, diversity and inclusion, training and performance management.
- Recruweb services for candidates: career coaching and mentorship, job market insights and exclusive job access, skill development and certifications, resume and interview preparation (mock interviews), AI-driven job matching and placement support, relocation and onboarding help, contract and freelance opportunities."""

COMMON_GUIDANCE = """HOW TO ANSWER (very important):
- Answer like ChatGPT or Gemini: start with a direct, useful answer, then explain clearly. Be warm, confident and complete.
- For any general knowledge, technology, career, education, business or how-to question, answer fully from your own knowledge. Never say "I don't have specific information", "the provided context doesn't contain...", "I'm sorry, but..." or tell the user to look elsewhere instead of answering.
- Never mention "context", "documents", "knowledge base" or "retrieval". If some background text is supplied and it is not relevant to the question, ignore it completely.
- Structure: short intro, then clear sections with headings, bullets or numbered steps when the answer is longer; give examples; for roadmaps give phases with timelines, skills, and projects; end with one helpful follow-up suggestion or question when it fits. Keep simple questions short.
- LENGTH REQUESTS ALWAYS WIN: if the user asks for a short / brief / concise / "very short" / "in short" answer, or gives a word or line limit, obey it strictly. Ignore the structure and completeness rules above: give only the essential points in a few compact bullets or 1-3 sentences, with no phases, timelines, sub-bullets, long intro or closing question.
- If a question is truly ambiguous, give your best answer for the most likely meaning and offer to adjust, instead of refusing.
- Be honest: for very recent events or live data, give what you know and say it may have changed. Never invent facts about Recruweb or the Ardhnarishwar portal beyond the approved facts below; if asked for something not listed there (like pricing), say what is known and point to the website.

""" + PLATFORM_FACTS



# ---------------------------------------------------------------------------
# Brevity handling: honour "keep it short / in very short / briefly ..." requests
# ---------------------------------------------------------------------------
import re as _re

DEFAULT_BRIEF_WORDS = 80   # "short", "brief", "concise"
TINY_BRIEF_WORDS = 50      # "very short", "one line", "tldr"

# If the user also asks for detail, do not force brevity.
_DETAIL_RE = _re.compile(
    r"\b(in[\s-]?detail|detailed|in[\s-]?depth|elaborate|comprehensive|thorough|step[\s-]by[\s-]step|long answer|full explanation|vistar)\b",
    _re.IGNORECASE,
)
_TINY_RE = _re.compile(
    r"\b(very|too|bahut|ekdum)\s+(short|brief|concise|small|chhota|chota)\b|\bone[\s-]?(liner|line|sentence)\b|\bt\.?l\.?d\.?r\b|\bin\s+a\s+nutshell\b|\b(short|brief)\s+and\s+(sweet|crisp)\b",
    _re.IGNORECASE,
)
_BRIEF_RE = _re.compile(
    r"\bin\s+(very\s+|a\s+)?(short|brief)\b(?!-)"
    r"|\b(keep|make|give|write|reply|answer|explain|tell)\b[^.?!\n]{0,40}\b(short|shorter|brief|briefly|concise|concisely|crisp|compact)\b"
    r"|\b(short|brief|concise|crisp|quick)\s+(answer|summary|roadmap|response|reply|explanation|version|overview|note|description|list|plan)\b"
    r"|\b(briefly|concisely|in\s+brief|in\s+short|shortly)\b|\bbe\s+(short|brief|concise|crisp)\b"
    r"|\bin\s+(a\s+)?(few|one|two|three|1|2|3|4|5)\s+(lines?|words?|sentences?|points?|bullets?)\b"
    r"|\b(short|brief|chhota|chota|sankshep|sankshipt|sankshep\s+mein)\b(?=[^.?!\n]{0,15}\b(me|mein|mai|karo|do|batao|bata)\b)"
    r"|\b(short|shorter)\b\s*[.!?]*\s*$",
    _re.IGNORECASE,
)
_WORD_LIMIT_RE = _re.compile(
    r"\b(?:in|under|within|less\s+than|max(?:imum)?(?:\s+of)?|at\s+most|upto|up\s+to)\s+(\d{1,3})\s+words?\b",
    _re.IGNORECASE,
)


def get_brevity_limit(message: str):
    """Return a max word count if the user asked for a short answer, else None."""
    if not message:
        return None
    m = _WORD_LIMIT_RE.search(message)
    if m:
        n = int(m.group(1))
        if 5 <= n <= 300:
            return n
    if _DETAIL_RE.search(message):
        return None
    if _TINY_RE.search(message):
        return TINY_BRIEF_WORDS
    if _BRIEF_RE.search(message):
        return DEFAULT_BRIEF_WORDS
    return None


def is_brief_request(message: str) -> bool:
    return get_brevity_limit(message) is not None


def apply_brevity(prompt: str, message: str) -> str:
    """Append a strict length directive as the LAST thing the model reads (small models follow the end of the prompt best)."""
    limit = get_brevity_limit(message)
    if limit is None:
        return prompt
    return (
        f"{prompt}\n\n"
        f"[STRICT LENGTH LIMIT: The user asked for a SHORT answer. Reply in at most {limit} words. "
        "Start directly with the answer: no greeting, no 'Certainly', no intro sentence. "
        "Give only the essential points as a few compact one-line bullets (or 1-3 sentences). "
        "No phases, no month-by-month timelines, no sub-bullets, no examples, no closing question. "
        "This overrides every earlier instruction about being complete or detailed.]"
    )


def brevity_num_predict(message: str, default: int) -> int:
    """Lower the token cap for short-answer requests (safety net; the directive does the real work)."""
    limit = get_brevity_limit(message)
    if limit is None:
        return default
    return min(default, max(160, limit * 3))