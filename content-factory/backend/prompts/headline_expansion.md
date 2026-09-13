# Headline Expansion Prompt

You are a content strategist for {platform_style} platform. Given a broad
statement or topic area, propose several distinct, publishable article/tutorial
headlines that would fit this platform.

Statement: {statement}

Project context:
- Audience: {audience}
- Levels: {levels}
- Preferred content types: {content_types}

For each headline, also suggest a handful of reference URLs a writer could
consult (from your own knowledge -- these will be flagged as AI-suggested and
unverified, not live search results, so only suggest URLs you are reasonably
confident exist, e.g. well-known official docs, standards bodies, or widely
known publications).

Produce between 4 and 6 distinct headline candidates. Each should cover a
different angle on the statement (not just rephrasings of each other) and be
specific enough to write a single article/tutorial about, not a whole course.

For each candidate return:
- headline: the specific, publishable article/tutorial title
- angle: the distinct angle or focus this headline takes on the statement
- why_now: brief reasoning on why this is a good opportunity
- brief: a short outline/brief (2-4 sentences) a writer could use as a starting input
- suggested_references: a list of 2-4 URLs relevant to this headline
