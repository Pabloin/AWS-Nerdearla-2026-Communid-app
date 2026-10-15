# Comunid

> **Comunid at Nerdearla — discover the people building your community.**

## Platform direction

The Nerdearla experience below describes the original Argentina application.
The new platform will keep that deployment running separately and introduce
`argentina.comunid.app` as its first independent tenant, without automatically
migrating existing users, passports, encounters, or QR links.

The initial platform model is **one tenant per experience**, one administrator
access, and two application variants: people/Heroes and countries with a world
map. Heroes becomes an internal component rather than a requirement for every
experience. Country collection uses a participant's profile country, independently
of live GPS location. Paraguay and re:Invent are planned examples of the countries
variant, which is not implemented yet.

Variants are configured in code. A module builder, organization/event hierarchy,
and granular administrator roles are outside the initial scope. See the
[multitenancy guide](docs/multitenancy.md) for the agreed scope, current status,
and independent deployment strategy.

## Idea

**Comunid** is an event experience that helps people discover the humans
who build a technology community.

At an event such as Nerdearla, participants explore the venue, start real
conversations, and scan QR badges to unlock digital cards for the people they
meet. The game-like experience gives each encounter a little meaning while
making it easier to approach someone new.

> The goal is not to collect people. It is to discover the people behind the
> community.

## The event loop

```text
Open Comunid
  -> see nearby discoveries, quests, or clues
  -> find a participating community builder
  -> have a real conversation
  -> scan their QR badge
  -> unlock their card, story, and points
  -> complete collections and earn event rewards
```

The QR scan is the proof of a real hello. A participant should need to meet the
person, not merely find a code online.

## Collectible community roles

Every participating person receives a profile and QR badge. Their card belongs
to one primary community role:

| Role | Who they are |
| --- | --- |
| **Heroes** | Speakers, organizers, mentors, open-source leaders, and people with a notable community story. |
| **Builders** | People creating products, companies, projects, meetups, or technical communities. |
| **Students** | Emerging talent, learners, and the next generation of builders. |
| **Connectors** | Volunteers, facilitators, sponsors, recruiters, and people who create opportunities for others. |
| **Legends** | Special guests and long-term contributors with a lasting impact on the community. |

An unlocked card can include:

- Name, photo, and role.
- A short story: what they build or contribute.
- Their “superpower” or community strength.
- City, community, project, or area of interest.
- A useful conversation prompt.
- The time and event where the meeting was recorded.

Example:

> **Ana — Builder**  
> AWS Community organizer · Buenos Aires  
> **Superpower:** connecting people through cloud education.  
> **Ask me about:** running your first study group.

## Quests and collections

The app gives players approachable reasons to meet different people instead of
only staying with their existing group.

Possible quests:

- Collect three Builders.
- Meet someone from a different city.
- Scan a Hero after their session.
- Find the Student Builder of the Day.
- Meet a Connector who can help you make a new professional connection.
- Complete a **Community Constellation**: one Hero, Builder, Student, and
  Connector.

Completing a collection can unlock a digital badge, a raffle entry, a sticker,
access to a small reward, or simply a commemorative event achievement.

## Player experience

The mobile app is a lightweight companion during the event:

1. **Discover** — map, nearby clues, featured builders, and current quests.
2. **Scan** — use the phone camera to read a builder’s QR badge.
3. **Collect** — view the person’s card and add it to a personal collection.
4. **Progress** — see completed sets, badges, and remaining quests.
5. **Remember** — after the event, keep a meaningful record of the people and
   communities discovered.

The game should be welcoming rather than competitive. A participant may scan a
few meaningful encounters or pursue every quest; both paths are valid.

## Organizer experience

Organizers need a small management space to:

- Create and edit builder profiles.
- Assign roles, tags, stories, conversation prompts, and rarity.
- Generate and print QR badges.
- Set which profiles, quests, or rewards are active for an event.
- See aggregate engagement: scans, completed quests, popular areas, and role
  diversity.
- Protect privacy: profiles participate only with consent and expose only the
  information each builder approves.

## Why it fits Nerdearla

Nerdearla already brings together people who learn, teach, create, volunteer,
and connect others. Comunid makes that invisible community fabric visible.

It offers newcomers an easy opening line, gives experienced attendees a reason
to meet new people, recognizes volunteers and students alongside speakers, and
turns networking into an inclusive shared activity.

## Product principles

- **Human first:** the conversation matters more than the scan.
- **Opt-in:** every profile and QR badge is voluntary.
- **Inclusive:** students, volunteers, and facilitators matter as much as
  recognized speakers.
- **Privacy-aware:** show only approved profile data and collect minimal player
  data.
- **Event-native:** it should work quickly on a phone, even in a busy venue.
- **Replayable:** the same model can be used by other communities and events.

## First event version

For a first Nerdearla edition, keep it focused:

- A mobile web app; no app-store installation.
- QR badges for a curated group of participating people.
- Five roles: Hero, Builder, Student, Connector, and Legend.
- Digital cards and a personal collection.
- Three to five simple quests.
- One completion reward or raffle entry.
- A basic organizer dashboard for profiles, QR generation, and engagement.

Future versions may add an event map, location-based discovery, team quests,
trading, session-linked challenges, and cross-event community profiles.
