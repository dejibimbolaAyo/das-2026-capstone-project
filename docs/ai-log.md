## Build 1

### Prompt 1: Build 1 prompt (domain core implementation)

- **What I asked:** Help me build the event ticketing and booking system's domain core using plain JavaScript ES modules, following the capstone requirements.
- **What came back:** Code and guidance for creating domain errors, generating unique IDs and booking references, implementing a FIFO queue using a linked list, creating events and ticket tiers, booking and cancelling tickets, looking up bookings by reference, managing the waitlist, and creating the demo and benchmark scripts.
- **What was wrong (or "nothing"):** The initial code needed to be implemented and tested step by step. During testing, I verified that failed bookings did not reduce available capacity, cancellation restored tickets, and the waitlist preserved its order. Further review of input validation and the complete requirements is still needed.

### Prompt 2: Test the demo and benchmark scripts

- **What I asked:** Help me test the event ticketing demo and compare booking lookups using `Array.find()` and `Map.get()`.
- **What came back:** The demo showed successful bookings, a rejected booking with the `SOLD_OUT` error, booking lookup by reference, cancellation, and the next person in the waitlist. The benchmark compared 500 lookups among 100,000 bookings and showed that `Map.get()` was much faster in the test run.
- **What was wrong (or "nothing"):** Nothing was wrong with the benchmark execution. It completed 500 lookups across 100,000 bookings. The measured times varied between runs, but Map.get() was much faster than Array.find() in both runs.
