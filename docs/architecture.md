# Build 3 Architecture

## Layers

```mermaid
flowchart TD
    Routes[HTTP routes] --> Services[Application services]
    Services --> Rules[Domain rules]
    Services --> Repositories[Repositories]
```

- **Routes** may parse HTTP input and format HTTP responses; they may not implement business rules or access persistence directly.
- **Services** may coordinate use cases by calling domain rules and repositories; they may not contain transport-specific behavior or bypass domain rules.
- **Domain rules** may enforce business invariants using domain data; they may not depend on HTTP, services, or repositories.
- **Repositories** may load and save data; they may not make business decisions or call services or routes.

## Data model

```mermaid
erDiagram
    USERS ||--o{ BOOKINGS : makes
    EVENTS ||--|{ TICKET_TIERS : offers
    EVENTS ||--o{ BOOKINGS : receives
    TICKET_TIERS ||--o{ BOOKINGS : reserves

    USERS {
        string id
        string name
        string email
    }
    EVENTS {
        string id
        string title
        string city
        string venue
        datetime date
        string status
    }
    TICKET_TIERS {
        string id
        string event_id
        string name
        integer price_cents
        integer capacity
    }
    BOOKINGS {
        string id
        string user_id
        string event_id
        string tier_id
        integer quantity
        integer total_cents
        string status
    }
```

## Booking life cycle

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> paid
    pending --> cancelled
    paid --> checked_in
    paid --> refunded
    paid --> cancelled
    cancelled --> [*]
    refunded --> [*]
    checked_in --> [*]
```
