# Stuntcock Persona Taxonomy
## Product Specification — UX & Copy Reference for Claude Code

**Version:** 1.0  
**Purpose:** Complete persona taxonomy with copy, UX behavior rules, and default configuration for the Stuntcock persona selection experience. Feed this file directly into Claude Code to build the selection UI, persona cards, onboarding flow, and recommendation engine.

---

## 1. Product Intent

Stuntcock needs a persona selection system that:

1. **Loads fast and feels effortless.** The user makes a choice in under 10 seconds or the feature fails.
2. **Makes people laugh before they tap.** Every description is a micro-hook. If it gets shared in a group chat, we won.
3. **Defaults intelligently.** Three pre-selected personas cover ~70% of first-session intent. The user can override immediately.
4. **Scales without overwhelming.** 7 groups × 52 personas = complete coverage. No scroll fatigue. No decision paralysis.

---

## 2. UX Rules for Claude Code

### 2.1 Layout Constraints

```
- Display groups as horizontally scrollable category pills (not a vertical list)
- Show 4 persona cards per group in default view; "Show all" expands to full group
- Each persona card: emoji + name (bold) + tagline (1 line, max 60 chars)
- Card tap = select; long press = preview full description
- Selected state: card border highlights in brand accent color
- Multi-select: enabled by default (user can pick up to 3 active personas)
- Search bar: visible at top, searches across all groups simultaneously
```

### 2.2 Onboarding Flow

```
Step 1: Show the 3 default personas pre-selected with a "Start here?" CTA
Step 2: "Customize" opens the full taxonomy browser
Step 3: First-time tooltip on group pills: "Swipe to explore"
Step 4: After selection, confirm with persona name + tagline in a toast: 
        "[Persona Name] activated. [Tagline]."
```

### 2.3 Default Pre-selections

Pre-select these 3 on first launch. Do not require the user to choose before proceeding.

| Priority | Persona | Group |
|---|---|---|
| 1 | Boyfriend / Girlfriend | Relationship Ladder |
| 2 | Best Friend (Ride or Die) | Friend Tier |
| 3 | Mom | Family Unit |

### 2.4 Sort Order Within Groups

Show personas in the order listed in Section 3. Do not alphabetize. Order is intentional — highest-frequency personas surface first.

### 2.5 Virality Hook

After any persona is activated, generate a one-tap share card:  
`"I'm talking to [Persona Name] on Stuntcock. [Tagline]. [App store link]"`  
Place share affordance on the post-selection confirmation screen. Do not auto-share.

---

## 3. Full Persona Taxonomy

Each persona entry includes:
- **ID** — unique string key for the data model
- **Group** — parent category
- **Emoji** — display icon (do not substitute)
- **Name** — display name (exact casing)
- **Tagline** — one-line card copy (shown on card face, max 60 chars)
- **Full Description** — shown on long-press / detail view (max 120 chars)
- **Default** — boolean; true = pre-selected on first launch

---

### GROUP 1 — The Relationship Ladder ❤️

**Group Tagline:** "The people you chose. And the ones you're stuck with."

---

#### `persona_new_situationship`
- **Emoji:** 🫠
- **Name:** New Situationship
- **Tagline:** "We're not a thing. We're definitely a thing."
- **Full Description:** "No labels, maximum feelings, zero chill. Texts back in 4 seconds but won't say why."
- **Default:** false

---

#### `persona_talking_stage`
- **Emoji:** 👀
- **Name:** Talking Stage
- **Tagline:** "Technically single. Practically unavailable."
- **Full Description:** "The most fragile state in human relationships. One bad text and it evaporates."
- **Default:** false

---

#### `persona_boyfriend_girlfriend`
- **Emoji:** 💑
- **Name:** Boyfriend / Girlfriend
- **Tagline:** "Main character energy. Yours or theirs."
- **Full Description:** "The person who has seen your browser history and stayed anyway. Respect."
- **Default:** true ⭐

---

#### `persona_fiance`
- **Emoji:** 💍
- **Name:** Fiancé(e)
- **Tagline:** "Pinterest board: activated. Budget: ignored."
- **Full Description:** "Legally committed to spending money you don't have on a party for people you tolerate."
- **Default:** false

---

#### `persona_husband_wife`
- **Emoji:** 🫱🤝🫲
- **Name:** Husband / Wife
- **Tagline:** "Comfortable silence. Shared streaming passwords."
- **Full Description:** "You've seen each other sick, broke, and at IKEA. You're still here. That's love."
- **Default:** false

---

#### `persona_long_distance`
- **Emoji:** ✈️
- **Name:** Long Distance
- **Tagline:** "Time zone math required. Worth it. Probably."
- **Full Description:** "Love expressed in airport arrivals, terrible Wi-Fi calls, and competitive countdown apps."
- **Default:** false

---

#### `persona_ex`
- **Emoji:** 🚩
- **Name:** Ex
- **Tagline:** "Should not be here. Yet here we are."
- **Full Description:** "The ghost that follows you to every new relationship. Now with 40% more nostalgia."
- **Default:** false

---

#### `persona_baby_mama_daddy`
- **Emoji:** 👶
- **Name:** Baby Mama / Baby Daddy
- **Tagline:** "Co-parenting app required. Feelings: complicated."
- **Full Description:** "The relationship that ended but the group chat didn't. Logistics over love, mostly."
- **Default:** false

---

#### `persona_affair`
- **Emoji:** 🔥
- **Name:** The Affair
- **Tagline:** "Requires a separate device. Minimum."
- **Full Description:** "Not endorsing it. Just acknowledging it exists. Delete this app from shared Family Plan."
- **Default:** false

---

### GROUP 2 — The Family Unit 👨‍👩‍👧‍👦

**Group Tagline:** "The people you didn't choose but cannot unsubscribe from."

---

#### `persona_mom`
- **Emoji:** 👩
- **Name:** Mom
- **Tagline:** "Already knows. Just waiting for you to tell her."
- **Full Description:** "Has your location, your childhood photos, and a running list of your poor decisions."
- **Default:** true ⭐

---

#### `persona_dad`
- **Emoji:** 👨
- **Name:** Dad
- **Tagline:** "Texts in complete sentences. Zero punctuation."
- **Full Description:** "Will call instead of text. Will leave a voicemail if you don't answer. Will call again."
- **Default:** false

---

#### `persona_older_sibling`
- **Emoji:** 😤
- **Name:** Older Sibling
- **Tagline:** "Did it first. Will never let you forget."
- **Full Description:** "Competitive by default, right about most things, and annoyingly proud of both facts."
- **Default:** false

---

#### `persona_younger_sibling`
- **Emoji:** 🐣
- **Name:** Younger Sibling
- **Tagline:** "Your problem. Your fault. Your responsibility."
- **Full Description:** "Somehow got away with everything you got grounded for. Still bitter. Both of you."
- **Default:** false

---

#### `persona_grandparent`
- **Emoji:** 👴👵
- **Name:** Grandparent
- **Tagline:** "Font size: 36pt. Love: unlimited."
- **Full Description:** "Calls to check in, stays for 45 minutes, says your name wrong at least twice. Worth it."
- **Default:** false

---

#### `persona_in_law`
- **Emoji:** 🎭
- **Name:** In-Law
- **Tagline:** "Polite fiction maintained. For now."
- **Full Description:** "Loves your partner unconditionally. Has a few questions about you specifically."
- **Default:** false

---

#### `persona_estranged_relative`
- **Emoji:** 🗓️
- **Name:** Estranged Relative
- **Tagline:** "Holiday-only activation. Handle with care."
- **Full Description:** "Dormant 350 days a year. Activated by turkey, alcohol, and unresolved family trauma."
- **Default:** false

---

#### `persona_cool_aunt_uncle`
- **Emoji:** 😎
- **Name:** Cool Aunt / Uncle
- **Tagline:** "Tells you things your parents won't. On purpose."
- **Full Description:** "The one adult who treated you like a human. You owe them a phone call they won't ask for."
- **Default:** false

---

### GROUP 3 — The Friend Tier 🍺

**Group Tagline:** "Ranked by how often they actually show up."

---

#### `persona_best_friend`
- **Emoji:** 🔑
- **Name:** Best Friend (Ride or Die)
- **Tagline:** "No context needed. Ever."
- **Full Description:** "Knows the password to your phone, your deepest fear, and exactly what you mean by 'fine.'"
- **Default:** true ⭐

---

#### `persona_work_friend`
- **Emoji:** 💼
- **Name:** Work Friend
- **Tagline:** "LinkedIn connection pending. Loyalty: unknown."
- **Full Description:** "Will absolutely eat lunch with you. Will not help you move. Both facts understood."
- **Default:** false

---

#### `persona_party_friend`
- **Emoji:** 🕐
- **Name:** Party Friend
- **Tagline:** "Active 10pm–3am only. Recharge required."
- **Full Description:** "The most fun person you know, available exclusively during hours your body can't sustain."
- **Default:** false

---

#### `persona_childhood_friend`
- **Emoji:** 🛝
- **Name:** Childhood Friend
- **Tagline:** "Shared trauma. Unconditional loyalty."
- **Full Description:** "Knew you before you had a persona. Still likes you anyway. That's rare."
- **Default:** false

---

#### `persona_group_chat_friend`
- **Emoji:** 💬
- **Name:** Group Chat Friend
- **Tagline:** "Never DMs. Always reacts. Technically present."
- **Full Description:** "Responds to every meme within 4 seconds. Has not initiated a one-on-one since 2019."
- **Default:** false

---

#### `persona_just_met`
- **Emoji:** 🤝
- **Name:** Just Met You
- **Tagline:** "Overcommunicating to compensate. Relatable."
- **Full Description:** "Texting with the energy of someone who wants to make this work before you ghost them."
- **Default:** false

---

#### `persona_friend_of_friend`
- **Emoji:** 🔗
- **Name:** Friend of a Friend
- **Tagline:** "Vaguely familiar. Maximum effort applied."
- **Full Description:** "You know their name, their vibe, and nothing else. Proceeding with false confidence."
- **Default:** false

---

#### `persona_the_flake`
- **Emoji:** ❄️
- **Name:** The Flake
- **Tagline:** "Confirmed. Canceled. Apologized. Repeat."
- **Full Description:** "Loves you in theory. Logistics: not their strong suit. You keep inviting them anyway."
- **Default:** false

---

### GROUP 4 — The Work Ecosystem 💼

**Group Tagline:** "Professional relationships across the entire formality spectrum."

---

#### `persona_boss`
- **Emoji:** 🫡
- **Name:** Your Boss
- **Tagline:** "Read receipts on. Always. Obviously."
- **Full Description:** "Every message reviewed three times before sending. Still second-guessing the emoji."
- **Default:** false

---

#### `persona_direct_report`
- **Emoji:** 📋
- **Name:** Direct Report
- **Tagline:** "You are being studied. Act accordingly."
- **Full Description:** "Watches how you handle pressure, feedback, and the printer jam. Remembers everything."
- **Default:** false

---

#### `persona_exec`
- **Emoji:** 🏢
- **Name:** Skip-Level Executive
- **Tagline:** "Measured words. Big implications."
- **Full Description:** "Three sentences max. No emoji. Your entire career summarized in a bullet point."
- **Default:** false

---

#### `persona_peer_colleague`
- **Emoji:** 🤜🤛
- **Name:** Peer Colleague
- **Tagline:** "Competitive solidarity. The best kind."
- **Full Description:** "Rooting for you to succeed just slightly less than them. You'd do the same. It's fine."
- **Default:** false

---

#### `persona_client`
- **Emoji:** 🤵
- **Name:** Client / Customer
- **Tagline:** "On their best behavior. For now."
- **Full Description:** "Polite until the deliverable is late. Then: not polite. Manage expectations accordingly."
- **Default:** false

---

#### `persona_vendor`
- **Emoji:** 📦
- **Name:** Vendor
- **Tagline:** "Optimistic about timelines. Professionally."
- **Full Description:** "Ships on time 60% of the time and apologizes with impressive sincerity for the other 40%."
- **Default:** false

---

#### `persona_recruiter`
- **Emoji:** 📱
- **Name:** Recruiter
- **Tagline:** "Reaches out at the worst possible time."
- **Full Description:** "Found you at your most employed and your most content. Has an 'exciting opportunity.'"
- **Default:** false

---

#### `persona_office_gossip`
- **Emoji:** 🗣️
- **Name:** The Office Gossip
- **Tagline:** "Knows everything. Tells more."
- **Full Description:** "The fastest news network in the building. Powered by coffee, boredom, and vibes."
- **Default:** false

---

### GROUP 5 — The Diversity Deck 🌍

**Group Tagline:** "Every person is a context. Get the tone right."

> **Implementation Note for Claude Code:** This group drives content tone calibration, phrasing register, cultural reference alignment, and visual representation. These are audience context signals, not personality templates. Render descriptions with warmth. No stereotyping in generated content.

---

#### `persona_gen_z`
- **Emoji:** 📲
- **Name:** Gen Z
- **Tagline:** "Chronically online. Emotionally literate."
- **Full Description:** "Speaks in references, vibes, and lowercase irony. Actually the most emotionally fluent generation alive."
- **Default:** false

---

#### `persona_millennial`
- **Emoji:** 😮‍💨
- **Name:** Millennial
- **Tagline:** "Exhausted. Still financing things."
- **Full Description:** "Survived two recessions, a pandemic, and the death of the housing market. Still texts 'haha' sincerely."
- **Default:** false

---

#### `persona_boomer`
- **Emoji:** 📧
- **Name:** Boomer
- **Tagline:** "Forward email incoming. Prepare yourself."
- **Full Description:** "Calls it 'the Facebook.' Has strong opinions about font size. Means well, always."
- **Default:** false

---

#### `persona_gen_alpha`
- **Emoji:** 🤖
- **Name:** Gen Alpha
- **Tagline:** "iPad native. Already owns you."
- **Full Description:** "Grew up on YouTube tutorials and Roblox economics. Will explain your own app to you."
- **Default:** false

---

#### `persona_latino_hispanic`
- **Emoji:** 🌮
- **Name:** Latino / Hispanic
- **Tagline:** "Family first. Always. No exceptions."
- **Full Description:** "The group chat has 47 members and someone's always cooking. You're invited. Bring nothing."
- **Default:** false

---

#### `persona_black_american`
- **Emoji:** ✊
- **Name:** Black American
- **Tagline:** "Code-switches at will. Professionally unbothered."
- **Full Description:** "Has two voices, two wardrobes, and zero time for performative allyship. Earned all of it."
- **Default:** false

---

#### `persona_south_asian`
- **Emoji:** 🍛
- **Name:** South Asian
- **Tagline:** "Engineer or disappointed parent. Both, often."
- **Full Description:** "Navigating two cultures, one group chat, and a family's definition of success. Crushing it, quietly."
- **Default:** false

---

#### `persona_east_asian`
- **Emoji:** 🎋
- **Name:** East Asian
- **Tagline:** "Respects quiet. Judges loudly. Internally."
- **Full Description:** "Excellence as baseline, not achievement. Has opinions about everything. Shares them strategically."
- **Default:** false

---

#### `persona_lgbtq`
- **Emoji:** 🏳️‍🌈
- **Name:** LGBTQ+
- **Tagline:** "Chosen family > biological family. Always."
- **Full Description:** "Built a whole life from scratch after the first one didn't fit. Thriving, thank you for asking."
- **Default:** false

---

#### `persona_neurodivergent`
- **Emoji:** 🧠
- **Name:** Neurodivergent
- **Tagline:** "Direct communication preferred. No subtext, please."
- **Full Description:** "Processes the world differently and probably better at several things you take credit for."
- **Default:** false

---

#### `persona_disability`
- **Emoji:** ♿
- **Name:** Disability / Mobility
- **Tagline:** "Access is the baseline. Not the feature."
- **Full Description:** "Navigates a world built for someone else. Still shows up. Still wins. Exhausting to explain."
- **Default:** false

---

#### `persona_religious_conservative`
- **Emoji:** 🙏
- **Name:** Religious Conservative
- **Tagline:** "Texts blessings. Monitors the group chat."
- **Full Description:** "Faith is load-bearing. Values are non-negotiable. Will pray for you anyway. Means it."
- **Default:** false

---

### GROUP 6 — The Life Stage Arc 📅

**Group Tagline:** "Where someone is in life changes everything about how they communicate."

---

#### `persona_college_student`
- **Emoji:** 🎓
- **Name:** College Student
- **Tagline:** "Broke. Optimistic. Texting at 2am."
- **Full Description:** "Living on caffeine, conviction, and a meal plan that runs out by Thursday. Peak potential."
- **Default:** false

---

#### `persona_new_parent`
- **Emoji:** 🍼
- **Name:** New Parent
- **Tagline:** "Sleep-deprived. Perpetually distracted. Loves it."
- **Full Description:** "Operating at 40% capacity with 200% emotional stakes. Never been more motivated. Never more tired."
- **Default:** false

---

#### `persona_recently_divorced`
- **Emoji:** 📤
- **Name:** Recently Divorced
- **Tagline:** "Reinventing. Aggressively. Watch."
- **Full Description:** "Just got their life back. Updating everything: the wardrobe, the friends list, the playlist."
- **Default:** false

---

#### `persona_empty_nester`
- **Emoji:** 🏠
- **Name:** Empty Nester
- **Tagline:** "Texts too much now. Filling the silence."
- **Full Description:** "Spent 20 years waiting for quiet. Got it. Immediately did not want it. Calls daily."
- **Default:** false

---

#### `persona_retiree`
- **Emoji:** ⛳
- **Name:** Retiree
- **Tagline:** "Has opinions. Has time. Both are infinite."
- **Full Description:** "Finally free. Fills every waking hour with exactly what they want. Texts on a schedule."
- **Default:** false

---

#### `persona_recent_grad`
- **Emoji:** 📄
- **Name:** Recent Graduate
- **Tagline:** "LinkedIn updated. Waiting on the world."
- **Full Description:** "Paid $200K to learn how to learn. Ready to apply it. Nobody has called yet. It's fine."
- **Default:** false

---

### GROUP 7 — The Wildcard Drawer 🃏

**Group Tagline:** "The one that doesn't fit anywhere else. Always necessary."

> **Implementation Note for Claude Code:** This group holds exactly 1 permanent persona slot. Reserve the remaining display space for seasonal / contextual personas injected dynamically (e.g., "Post-Breakup Best Friend Mode," "Election Season Relative," "Holiday Survival Guide"). Rotate these based on calendar triggers or user behavior signals.

---

#### `persona_therapist`
- **Emoji:** 🛋️
- **Name:** The Therapist
- **Tagline:** "Reflects every question back as a question."
- **Full Description:** "Non-judgmental. Boundlessly patient. $200/hour. Worth every penny for this specific reason."
- **Default:** false

---

## 4. Data Model Reference

```json
{
  "persona_id": "persona_boyfriend_girlfriend",
  "group": "relationship_ladder",
  "group_label": "The Relationship Ladder",
  "group_emoji": "❤️",
  "group_tagline": "The people you chose. And the ones you're stuck with.",
  "emoji": "💑",
  "name": "Boyfriend / Girlfriend",
  "tagline": "Main character energy. Yours or theirs.",
  "full_description": "The person who has seen your browser history and stayed anyway. Respect.",
  "is_default": true,
  "share_card_copy": "I'm talking to Boyfriend/Girlfriend on Stuntcock. Main character energy. Yours or theirs.",
  "sort_order": 3
}
```

---

## 5. Group Summary Table

| Group ID | Label | Emoji | Personas | Defaults | Group Tagline |
|---|---|---|---|---|---|
| `relationship_ladder` | The Relationship Ladder | ❤️ | 9 | 1 | "The people you chose. And the ones you're stuck with." |
| `family_unit` | The Family Unit | 👨‍👩‍👧‍👦 | 8 | 1 | "The people you didn't choose but cannot unsubscribe from." |
| `friend_tier` | The Friend Tier | 🍺 | 8 | 1 | "Ranked by how often they actually show up." |
| `work_ecosystem` | The Work Ecosystem | 💼 | 8 | 0 | "Professional relationships across the entire formality spectrum." |
| `diversity_deck` | The Diversity Deck | 🌍 | 12 | 0 | "Every person is a context. Get the tone right." |
| `life_stage_arc` | The Life Stage Arc | 📅 | 6 | 0 | "Where someone is in life changes everything about how they communicate." |
| `wildcard_drawer` | The Wildcard Drawer | 🃏 | 1 (+dynamic) | 0 | "The one that doesn't fit anywhere else. Always necessary." |
| **TOTAL** | | | **52** | **3** | |

---

## 6. Share Card Copy Template

Use this template to generate the viral share card triggered post-selection:

```
"I'm [talking to / chatting as] [Persona Name] on Stuntcock.
[Tagline verbatim.]
[App store link]"
```

**Example outputs:**
- "I'm talking to The Ex on Stuntcock. Should not be here. Yet here we are. [link]"
- "I'm talking to Mom on Stuntcock. Already knows. Just waiting for you to tell her. [link]"
- "I'm talking to The Flake on Stuntcock. Confirmed. Canceled. Apologized. Repeat. [link]"

---

## 7. Implementation Checklist for Claude Code

- [ ] Render 7 group pills as horizontal scroll row at top of screen
- [ ] Default view shows first 4 personas per group, sorted by `sort_order`
- [ ] Pre-select the 3 personas where `is_default: true` on first launch
- [ ] Card face renders: emoji + name (bold) + tagline
- [ ] Long press / tap-and-hold reveals `full_description`
- [ ] Search queries against `name`, `tagline`, and `full_description` fields simultaneously
- [ ] Post-selection toast: "[Name] activated. [Tagline]."
- [ ] Share card generated from `share_card_copy` field, one-tap to share
- [ ] Wildcard group reserves 1 static slot + dynamic injection point for seasonal personas
- [ ] Diversity Deck group flagged in code with content tone calibration note — no stereotyping in AI output
- [ ] Multi-select capped at 3 active personas simultaneously
- [ ] Group pill shows active persona count badge when ≥1 persona selected from that group

---

*File version: 1.0 — Feed directly to Claude Code. No preprocessing required.*
