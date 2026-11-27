# Build 3 Architecture

## Application layers

```mermaid
flowchart TD
    Routes[Routes] --> Services[Services]
    Services --> Rules[Rules]
    Services --> Repositories[Repositories]
    Rules --> Data[Domain data]
    Repositories --> Data
```

- **Routes** may receive HTTP requests and format HTTP responses; routes may not contain booking business rules or access repositories directly.
- **Services** may coordinate use cases and call rules and repositories; services may not handle raw HTTP responses or call routes.
- **Rules** may enforce domain invariants and state transitions; rules may not perform HTTP or database I/O.
- **Repositories** may persist and retrieve data; repositories may not contain route handlers or enforce use-case-level policy.

## Data model

```mermaid
erDiagram
    EVENTS ||--o{ TICKET_TIERS : has
    USERS ||--o{ BOOKINGS : makes
    TICKET_TIERS ||--o{ BOOKINGS : includes

    EVENTS {
        string id
        string organizerId
        string title
        string city
        string venue
        datetime startsAt
        string status
    }
    TICKET_TIERS {
        string id
        string eventId
        string name
        int priceCents
        int capacity
        int sold
    }
    BOOKINGS {
        string id
        string reference
        string userId
        string tierId
        int quantity
        int amountCents
        string status
        datetime createdAt
    }
    USERS {
        string id
        string role
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
