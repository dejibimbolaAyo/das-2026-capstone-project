# Build 3 architecture

## Layers

```mermaid
flowchart TB
  routes[HTTP routes] --> services[Services]
  services --> rules[Domain rules]
  services --> repositories[Repositories]
  repositories --> data[(Data store)]
```

- **Routes** may translate HTTP requests and responses; they may not contain business rules or access data directly.
- **Services** may coordinate domain rules and repositories; they may not depend on HTTP details or call routes.
- **Domain rules** may validate and apply business rules; they may not perform I/O or depend on services, repositories, or routes.
- **Repositories** may read and write data; they may not make business decisions or call services, rules, or routes.
- **Data store** holds persisted data; it may not call application layers.

## Data model

```mermaid
erDiagram
  USERS ||--o{ EVENTS : organizes
  USERS ||--o{ BOOKINGS : makes
  EVENTS ||--o{ TICKET_TIERS : offers
  TICKET_TIERS ||--o{ BOOKINGS : reserves

  USERS {
    string id PK
    string name
    string email
    string role
  }
  EVENTS {
    string id PK
    string organizer_id FK
    string title
    string city
    string venue
    datetime starts_at
    string status
  }
  TICKET_TIERS {
    string id PK
    string event_id FK
    string name
    integer price_cents
    integer capacity
    integer sold
  }
  BOOKINGS {
    string id PK
    string user_id FK
    string tier_id FK
    string reference
    integer quantity
    integer amount_cents
    string status
    datetime created_at
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
