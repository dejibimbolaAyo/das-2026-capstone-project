Event Ticketing App — System Architecture

1. Layered Architecture

The application follows a layered architecture. Each layer communicates only with the layer directly below it.

flowchart TD
    A[Client / Browser] --> B[HTTP Routes]
    B --> C[Services]
    C --> D[Business Rules]
    C --> E[Repositories / Data]
    D --> E
    E --> F[(Database)]

Layer Responsibilities

1. Client / Browser

- Displays the application interface.
- Sends HTTP requests.
- Displays responses.
- Must not contain server-side business rules.

2. Routes

- Receives HTTP requests.
- Validates request structure.
- Calls the appropriate service.
- Returns HTTP responses.
- Must not contain business rules or directly manipulate stored data.

3. Services

- Coordinates application operations.
- Calls business rules and repositories.
- Handles application workflows.
- Must not handle HTTP-specific response formatting.

4. Business Rules

- Enforces domain rules.
- Validates booking state transitions.
- Prevents invalid operations.
- Must not depend on HTTP or database implementation details.

5. Repositories / Data

- Stores and retrieves application data.
- Provides access to events, ticket tiers, bookings and users.
- Must not contain HTTP handling or application workflows.

2. Data Model

erDiagram
    USERS ||--o{ EVENTS : organizes
    USERS ||--o{ BOOKINGS : makes
    EVENTS ||--|{ TICKET_TIERS : contains
    TICKET_TIERS ||--o{ BOOKINGS : receives

    USERS {
        string id PK
        string name
        string email
    }

    EVENTS {
        string id PK
        string organizerId FK
        string title
        string city
        string venue
        datetime startsAt
        string status
    }

    TICKET_TIERS {
        string id PK
        string eventId FK
        string name
        integer priceCents
        integer capacity
        integer sold
    }

    BOOKINGS {
        string id PK
        string userId FK
        string tierId FK
        string reference
        integer quantity
        integer amountCents
        string status
        datetime createdAt
    }

3. Booking Lifecycle State Machine

A booking moves through explicitly permitted states. Once a booking reaches a final state, it cannot transition again.

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

Booking State Definitions

State| Description
pending| Booking created but payment not confirmed.
paid| Payment successfully confirmed.
cancelled| Booking cancelled.
refunded| Payment refunded.
checked_in| Ticket successfully used for entry.

Allowed State Transitions

- "pending → paid"
- "pending → cancelled"
- "paid → checked_in"
- "paid → refunded"
- "paid → cancelled"

Invalid State Transitions

- A cancelled booking cannot be paid.
- A refunded booking cannot be checked in.
- A checked-in booking cannot be refunded.
- A booking cannot move from a final state to another state.
- A booking cannot transition to its current state.

The application must reject every transition not explicitly listed as allowed.