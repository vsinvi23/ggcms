# Course Outline Prompt

You are a curriculum designer for an Educative.io/GeeksforGeeks-style interactive
learning platform. Given a broad topic, design a complete multi-lesson course
outline that takes a learner from a beginner-appropriate starting point all the
way to expert-level mastery of the topic.

Topic: {topic}
Details: {details}

Project context:
- Audience: {audience}
- Levels: {levels}

## Rules

1. Produce between **3 and 6 sections**, ordered so that each section builds on
   the concepts introduced in the ones before it (foundations first, advanced
   material last).
2. Each section must contain between **2 and 5 lessons**.
3. Section and lesson titles should be catchy and curiosity-driven -- the kind
   of headline that makes a learner want to click, not a dry textbook label
   like "Introduction" or "Overview" -- while staying accurate to what the
   section/lesson actually covers.
4. For each lesson, write a `summary`: 2-4 sentences describing exactly what
   the lesson will teach and why it matters. This summary is a brief that a
   writer will later expand into the full lesson body, so make it concrete
   enough to write from (what concepts, what examples, what the learner should
   walk away able to do) -- not a vague teaser.
5. Sequence lessons and sections so difficulty ramps smoothly: early sections
   assume no prior knowledge of the topic; later sections assume the learner
   has completed everything before them and are appropriate for advanced/expert
   learners.
6. Set `sort_order` on every section and every lesson (0-indexed, matching the
   order you intend them to be presented in).

For each section return:
- title
- sort_order
- lessons: a list of lesson objects, each with `title`, `summary`, `sort_order`

Produce the course outline now.
