# To-do card for the owner

The owner reads one to-do list and nothing else. Every question, click or key the owner must give becomes one card on that list. The card is the record; the chat and the daily message may repeat the question, but they never replace the card.

## Fields

| Field | What goes in it |
|---|---|
| **Task** | One plain sentence: what the owner must decide or do. |
| **Why** | Who is waiting and what is blocked until the owner answers. |
| **Source** | The chat or agent that asks (for example "Orchestrator"). |
| **Link** | Where to look: the ticket, the pull request, the screen. |
| **Source key** | `<source>:<date>:<short-name>`, unique. Search for it before you add a card, so there is never a duplicate. |
| **Minutes** | How long it takes the owner. |
| **Status** | "To do", "Doing" or "Done" (plus "New" and "Parked" if you use them; see `templates/notion-setup.md`). "Doing" is the owner's own column: agents never move a card into it or out of it. |

## Body: four parts, in plain words

1. **What is going on.**
2. **Why it is the owner's decision** (which of the owner's areas it falls in).
3. **What each option does:** option A and option B.
4. **The recommendation**, and why.

No ticket numbers as shorthand: say what the work is, and add the number only as a link.

## Rules

- **One card per question.** Never an umbrella card that collects other cards.
- **One sitting, one card.** Two things the owner does on the same screen go on one card.
- **Tell first, then the card.** Put the question to the owner in the chat or the daily message first. Never create a card for something the owner has never heard about.
- **Close it in the same turn.** When the owner answers, move the card to Done at once and write the decision, with its date, on the ticket.
- **Never stretch a decision.** If a new case is close to an earlier decision but not the same, ask again with a new card.
- **When work is blocked on the owner:** one card, one notification, then take the next ticket. Do not decide for the owner and do not work around the block.

## Example

> **Task:** Raise the monthly cap for the image service from <amount> to <amount>?
>
> **Why:** The cap was reached on <date>. New images for the website wait until the cap is raised or the month ends.
>
> **Source:** Orchestrator · **Link:** <ticket link> · **Source key:** `orchestrator:<date>:image-cap` · **Minutes:** 2
>
> **What is going on.** This month's image work used the whole cap, mostly for one large batch that is now finished.
>
> **Why it is your decision.** Raising a spending cap is in your money area.
>
> **Options.**
> A. Raise the cap to <amount> for this month only. The waiting images are made today.
> B. Keep the cap. The waiting images are made at the start of next month.
>
> **Recommendation: A.** The batch that used the cap is finished, and the extra amount is small.
