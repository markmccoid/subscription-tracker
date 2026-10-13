# Retain Subscription lifecycle events

Pauses, resumptions, cancellations, and reactivations will be retained as Lifecycle Events instead of relying on the Subscription's mutable current status. This makes Subscription Activity reconstructable after later transitions; events may be explicitly corrected or deleted because this is a personal financial organizer rather than an immutable regulatory audit log, and any automatically created Charge Exceptions must remain linked so corrections can reconcile only their own consequences atomically.
