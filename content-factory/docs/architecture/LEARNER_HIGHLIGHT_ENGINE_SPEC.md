# Learner Highlighting & Annotation Engine Specification

**Document Version:** 1.0  
**Feature:** Text selection + highlight colors (yellow/green/blue/pink) + optional notes  
**Database Persistence:** MongoDB (Engagement Collection)  
**Client Environment:** React 19 + TypeScript  

---

## 1. The Highlighting Problem Statement

Implementing reliable text highlighting on the web is deceptively complex. The system must:
1. **Intercept the Selection:** Detect when a user drags their cursor across a paragraph.
2. **Paint the Highlight:** Wrap the selected text nodes dynamically in a styled `<mark>` or `<span>` without corrupting the underlying HTML structure or breaking React's virtual DOM.
3. **Serialize the Selection:** Save the selection coordinates as a small, lightweight string or JSON object so it can be sent to the backend.
4. **Restore the Highlight:** Re-paint the selection when the learner returns, even if the underlying HTML shifts slightly (due to template rendering or edits).

---

## 2. Comparison of Technical Approaches & Alternatives

Here is the architectural comparison of the four main pathways to implement user-driven highlighting:

### Approach A: Native Web Selection API (Zero Dependencies)
* **How it works:** Uses native browser APIs. When a selection occurs, extract the CSS path of the parent node and start/end text offsets.
* **Pros:**
  * **Ultra-Lightweight:** 0 KB added package size.
  * **Future-proof:** Standard browser API, no external maintenance risks.
  * **Total Control:** Custom CSS rendering and flexible custom note triggers.
* **Cons:**
  * **Complex Implementation:** Coding cross-browser selection serialization, deserialization, and handling multi-paragraph nodes with nested elements is highly error-prone.

---

### Approach B: `web-highlighter` (Highly Recommended)
* **How it works:** A specialized, lightweight NPM package designed specifically to handle web-based selections, serialization, painting, and deserialization.
* **Pros:**
  * **Turnkey Robustness:** Handles nested HTML elements, multiple paragraphs, and text edits natively.
  * **Extremely Lightweight:** under 10 KB gzipped size.
  * **Built-in Serialization:** Generates clean, short serialization strings.
  * **Custom Styling:** Easy color mapping and click callback triggers.
* **Cons:**
  * Needs a thin React Hook wrapper to synchronize highlights with state.

---

### Approach C: `mark.js`
* **How it works:** A popular search-keyword highlighter. It searches the page and wraps keywords in `<mark>` elements dynamically.
* **Pros:**
  * **Proven Performance:** Extremely fast keyword search highlighting.
  * **Mature:** Huge community, stable.
* **Cons:**
  * **Bad for Custom Selection:** Designed primarily for search keywords rather than arbitrary user-drawn range-selections.

---

### Approach D: Apache Annotator (Incubating)
* **How it works:** An enterprise-grade, W3C Web Annotation standard compliant framework. Uses fuzzy-match algorithms (text position and text quote selectors).
* **Pros:**
  * **W3C Standard Compliant:** Standard-compliant JSON representations.
  * **Fuzzy Anchor Robustness:** Highlights survive major text changes or edits.
* **Cons:**
  * **Heavy & Complex:** Steep learning curve, overkill for simple learner notes, bloated codebase.

---

## 3. Comparison Matrix & Recommendation

| Criteria | Native API | `web-highlighter` (Rec) | `mark.js` | Apache Annotator |
|----------|------------|------------------------|-----------|------------------|
| **Primary Use-Case** | custom | User Ranges | Keyword Search | W3C Standards |
| **Package Size** | 0 KB | **~10 KB** | ~14 KB | ~60 KB |
| **Complexity** | Extremely High | **Very Low** | Low | High |
| **Fuzzy Matching** | No | Partially | No | **Highly Advanced**|
| **Multi-Paragraph** | Manual | **Out-of-the-box** | No | Out-of-the-box |

**Recommendation:** **Use `web-highlighter` (Approach B)**. It provides the best balance between ultra-lightweight footprint and out-of-the-box support for multi-paragraph selections, nested inline tags, and clean serializations.

---

## 4. End-to-End Highlighting Architecture Design

### 4.1 Datastore Schema (MongoDB Document)
We store user highlights in the **MongoDB Engagement Collection** as documents.

```json
{
  "_id": "uuid-string-of-highlight",
  "user_id": 5519,
  "content_id": "ai-coding-agents-001",
  "selection": {
    "start_meta": "div.article-body > p:nth-child(3)",
    "start_offset": 142,
    "end_meta": "div.article-body > p:nth-child(3)",
    "end_offset": 196,
    "text_quote": "The exact sentence selected by the user to ensure fuzzy fallback"
  },
  "color": "yellow",
  "note": "Optional learner annotation...",
  "created_at": "2026-08-31T12:00:00Z"
}
```

