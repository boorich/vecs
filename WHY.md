# Why run this system?

Most knowledge management systems fail the same way: they become archives.
You add things, you never retrieve them, and eventually the collection is so
large and so noisy that searching it returns worse results than just Googling.

This system is built around the opposite assumption.

---

## The core idea

Everything that has ever mattered to you — a research finding, a framework
that changed how you think, a decision you worked hard to reach, a pattern
you noticed across projects — it lives in your head until you forget it, then
it's gone. You might have saved the source, but the source isn't the insight.
The insight was the moment you understood something.

This system is a place to put that.

Not the article. Not the transcript. Your synthesis. The conclusion.
The thing you'd want to retrieve in 18 months when you're working on something
adjacent and you can feel that you've thought about this before, but you can't
remember exactly where or what you decided.

---

## What belongs here

**Yes:**
- Notes you wrote after reading something, in your own words
- Decisions you made and the reasoning behind them
- Frameworks or mental models you've adopted and tested
- Patterns you noticed that surprised you
- Conclusions from research, experiments, or projects
- Anything you'd be genuinely annoyed to lose

**No:**
- Raw source material you could find again in 30 seconds
- Meeting notes before you've extracted what actually matters
- Drafts, process notes, thinking-out-loud documents
- Content that's interesting but has no clear future use for you
- Anything you're saving "just in case"

The test: *if you lost this permanently, would you notice?*
If the answer is "probably not", don't ingest it.

---

## Why local-first?

Because this is personal data. It should not live on someone else's server,
depend on an API key that expires, or become inaccessible because a company
changed its pricing.

Everything here runs on your machine:
- Qdrant stores vectors in `./qdrant_data/` on your disk
- The embedding model runs locally, no network call required
- No account, no API key, no subscription

You own the data. You own the infrastructure. A Docker container and a
directory is all that stands between you and your entire knowledge base.

---

## Why query by similarity, not keyword?

Because you never remember the exact words you used.

Keyword search requires you to already know what you're looking for.
Similarity search lets you describe the problem you're currently facing
and surface what you knew about adjacent problems — even if the original
note used completely different terminology.

You write a note about "reducing cognitive load in UI design."
Six months later you're thinking about "decision fatigue in product flows."
A keyword search finds nothing. A similarity search finds exactly that note.

---

## The discipline: less is more

The system degrades if you treat it as an archive.

Every low-quality chunk competes with high-quality ones in retrieval.
The more noise you add, the worse your results get. This is not a filing
cabinet — it's a distillation of what you actually know.

`vecs check` exists to create friction before ingesting. The questions it
asks are not philosophical decoration — they are retrieval quality tests
in disguise. Content that fails those questions will generate noise in your
results, not signal.

The goal is a small, dense, high-quality collection that gets better over
time because you are ruthless about what earns a place in it.

---

## The long game

Run this for a year. Add only what genuinely passes the gate.

At the end of that year, you have a queryable record of everything you
actually learned — not everything you consumed, everything you *understood*.
You can query it the way you query your own memory: by describing a problem,
not by remembering a filename.

That is the system working as intended.
