## 1. Overstating importance / symbolism

AI often inflates ordinary topics into something historic, transformative, or profound.

**Typical pattern**

* “plays a vital role”
* “serves as a testament”
* “lasting legacy”
* “watershed moment”

**Short example**

> “The café became a testament to cultural resilience.”

Human version:

> “The café became popular with local artists.”

---

## 2. Promotional / tourism-style tone

Especially common in culture, geography, and history topics.

**Typical pattern**

* “rich cultural heritage”
* “breathtaking”
* “must-see”
* “vibrant atmosphere”

**Short example**

> “The city offers breathtaking architecture and vibrant traditions.”

Human version:

> “The city is known for colonial-era architecture and annual festivals.”

---

## 3. Empty profundity

Sounds meaningful without saying anything concrete.

**Typical pattern**

* “redefining the landscape”
* “more than just”
* “not just X, but Y”

**Short example**

> “This isn’t just software — it’s a revolution in human collaboration.”

Human version:

> “The software reduced onboarding time by 30%.”

---

## 4. Rule of three overload

AI loves triples and rhythmic triads.

**Typical pattern**

* “innovative, transformative, and groundbreaking”
* “efficient, scalable, and reliable”

**Short example**

> “The platform is intuitive, powerful, and revolutionary.”

Human version:

> “The platform is easier to use than earlier versions.”

([LinkedIn][2])

---

## 5. Negative parallelism

Overuse of rhetorical contrast formulas.

**Typical pattern**

* “It’s not X. It’s Y.”
* “More than a tool”
* “Not merely”

**Short example**

> “It’s not a database. It’s a movement.”

Human version:

> “The database is widely used by nonprofits.”

([Beutler Ink][3])

---

## 6. Generic abstraction

High abstraction, low information density.

**Typical pattern**

* “in today’s evolving world”
* “across various domains”
* “many experts agree”

**Short example**

> “Organizations increasingly leverage innovation across industries.”

Human version:

> “Banks adopted mobile verification systems after 2022.”

---

## 7. Excessive transitions / connectors

AI often chains paragraphs with formal transitions.

**Typical pattern**

* “Moreover”
* “Furthermore”
* “Additionally”
* “In conclusion”

**Short example**

> “Furthermore, the initiative underscores collaborative innovation.”

Human version:

> “The initiative also involved local universities.”

---

## 8. Compulsive summarizing

Repeats what was already said.

**Typical pattern**

* “Overall”
* “In summary”
* “In conclusion”

**Short example**

> “Overall, this demonstrates the importance of sustainability.”

Human version:

> (delete sentence entirely)

([The Worldcom Group®][4])

---

## 9. AI-favorite vocabulary

Certain words appear disproportionately often.

**Common words**

* delve
* tapestry
* intricate
* pivotal
* landscape
* foster
* underscore
* testament
* crucial

**Short example**

> “The initiative underscores the intricate tapestry of innovation.”

Human version:

> “The initiative connected research groups from five universities.”

([The Worldcom Group®][4])

---

## 10. Uniform rhythm and sentence length

Every sentence feels similarly shaped and equally polished.

**AI style**

> “The project launched in 2022. It gained attention quickly. It expanded internationally. It attracted investors.”

Human style**

> “The project launched quietly in 2022. Six months later, investors noticed.”

---

## 11. False ranges / fake breadth

AI creates artificial spectrums.

**Typical pattern**

* “from small communities to global movements”
* “from startups to enterprises”

**Short example**

> “The app impacted everyone from students to world leaders.”

Human version:

> “The app was adopted by several universities.”

([The Worldcom Group®][4])

---

## 12. Formatting overkill

Too much emphasis styling.

**Typical pattern**

* excessive **bold**
* many bullet lists
* headline-heavy structure

**Short example**

> “The **core mission** focuses on **innovation**, **growth**, and **transformation**.”

Human version:

> “The organization focuses on software training.”

---

## 13. Lack of lived experience

No sensory detail, uncertainty, or concrete memory.

**AI style**

> “The event created meaningful engagement opportunities.”

Human style**

> “About 40 people stayed after the workshop to exchange notes.”

([Medium][5])

---

## 14. Citation / source weirdness

Wikipedia-specific but useful for detection.

**Typical pattern**

* irrelevant citations
* fabricated references
* broken URLs
* citations that don’t support claims

**Short example**

> Citation about climate science attached to a paragraph about architecture.

([Wikipedia][6])

---

## 15. Excessive certainty / smoothness

AI avoids hesitation and ambiguity.

**AI style**

> “This strategy guarantees success.”

Human style**

> “The strategy improved retention in one pilot study.”

---

## 16. Over-neutralized emotional tone

Everything sounds polite, balanced, and sanitized.

**AI style**

> “The disagreement highlighted differing perspectives.”

Human style**

> “The board split 5–4 after a heated debate.”

---

## 17. Hallucinated specificity

Fake details mixed with confidence.

**AI style**

> “The treaty was signed in Geneva in 1843.”
> (when no such treaty exists)

Wikipedia editors consider this one of the strongest signals. ([New York Post][7])

---

# Useful Meta-Pattern for Training

A lot of AI writing can be summarized as:

> **high fluency + low informational entropy**

Meaning:

* grammatically smooth
* rhetorically polished
* semantically repetitive
* weak on concrete evidence

---

# Features Worth Turning Into Model Signals

You could train detectors/features around:

| Feature               | Signal                          |
| --------------------- | ------------------------------- |
| Adjective density     | “innovative, transformative...” |
| Abstract noun ratio   | innovation, landscape, synergy  |
| Transition frequency  | moreover, furthermore           |
| Triadic phrasing      | X, Y, and Z                     |
| Promotional sentiment | “breathtaking”, “vital”         |
| Sentence variance     | too uniform                     |
| Hedging absence       | overconfidence                  |
| Summary redundancy    | repeated conclusions            |
| Rhetorical templates  | “not just X but Y”              |
| Information density   | low facts per sentence          |

---

# Important Caveat

Wikipedia itself stresses these are **heuristics, not proof**. Humans naturally use many of these patterns too, and LLMs were trained on human writing.


# Additional Personal Ruleset:

- Additional ruleset for coding and programming AI detection

## B1. Humor

- Humor is a good way to reduce AI detection accuracy, but it's also heavily style-dependent.
- AI and human have different humor styles. AI jokes often rely on wordplay, puns, or absurdity, while human humor can be more nuanced, context-dependent and sometime nonsensical.

Example:

AI: "This Canvas render is so fast, it must be using quantum computing! Just kidding, it's actually optimized WebGL."

Human: "This Canvas is a fcking beast lmao, bro thought he was doing quantum physics sht"

- Important: humor should be rare, something to surprise, not to anticipate, and must not be as exaggerated as my example above. Reason:
  - It's unprofessional if abused heavily (both in number and joke's intensity)
  - It can actually backfire and make it more obvious that you are slopily trying to hide AI writing, triggering more scrutiny and suspicion.

## B2. Punctuation

- Stem heavily from programming language behaviour: Programmers tend to use ";" (for lower level languages) or nothing (for higher level languages) to end a line.
- Their muscle memory will automatically assumed ending a sentence with either ";" or <nothing> is natural. ";" however is not a common punctuation in normal writing in general, hence human developed the ability to flag ";" as offputting instantly and override the initial assumption. However, <nothing> goes undetected from muscle memory, and thus is "used" by programmer quite often, despite grammatically incorrect.
- AI are wired to use proper punctuation, so they will ALWAYS end a sentence with proper punctuation: the period "."

## B3. Foreign Symbols

- AI in general is notorious for the usage of documentation style, which often includes the usage of foreign symbols such as "→", "✓", "✗", "✔", "✘", "⚠️", "❌", "✅" etc. Emojis in general are offlimits.
- But the most dangerous one are emdash "—" and en dash "–", which are often used in documentation to separate clauses. They are NOT used in programming at all, since we tend to work with ASCII characters only. The presence of emdash and endash is a dead giveaway.
- You may be tempted to make a counterpoint: "Many comments act like documentation, so it's natural to use documentation style punctuation in them", however, these comments are still supposed to be written using code text (ASCII).


# Workspace Ruleset

## W1. Ai Context Documentation (.md files) CAN use standard documentation style

- These are context data for AI, so you are free to use whichever kind of language style to write these documents

## W2. ReadMe (for certain libraries, or modules) MUST follow the non-ai style

- These are documents explaining user how to use the library, not just for AI to get context from, so you must use the non-AI rules established aboves