import { DomainError } from "../errors.js";

// AUTHORIZATION: what is this person ALLOWED to do?
// (Authentication, "who is this?", is in auth.js and authService.js.)
// An "actor" is the logged-in user: { id, name, email, role }. No login means actor is null.

export function requireLogin(actor) {
  if (!actor) throw new DomainError("UNAUTHENTICATED", "Please log in first.");
  return actor;
}

// Wrong role is 403 FORBIDDEN: we know who you are, but this is not for your role.
export function requireRole(actor, ...roles) {
  requireLogin(actor);
  if (!roles.includes(actor.role)) {
    throw new DomainError("FORBIDDEN", `Only ${roles.join(" or ")} accounts can do this.`);
  }
  return actor;
}

// Can this actor change this event? Only the organizer who made it.
// Someone else's DRAFT is hidden completely (404), so drafts never leak.
export function requireEventOwner(event, actor) {
  requireRole(actor, "organizer");
  const isOwner = event.ownerId !== null && event.ownerId !== undefined && event.ownerId === actor.id;
  if (isOwner) return event;
  if (event.status !== "published") throw new DomainError("NOT_FOUND", `No event with id "${event.id}".`);
  throw new DomainError("FORBIDDEN", "This event belongs to another organizer.");
}

// Can this actor see this event? Published ones: everyone. Drafts: only the owner.
export function canSeeEvent(event, actor) {
  if (event.status === "published") return true;
  return Boolean(actor) && event.ownerId !== null && event.ownerId === actor.id;
}
