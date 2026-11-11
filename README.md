1. How did you model employees, brands, processes, pods and their relationships?

A Brand owns several Processes (CS, ACC, NDR, Retention). Each process carries its own operating calendar (ALL_365, EXCEPT_HOLIDAYS or NO_SUN_NO_HOLIDAY) and a default minStaff.
An Employee belongs to one Pod, and the pod points to its lead.
Employees connect to processes through Assignments. That is a many-to-many link, so one person can cover several processes or brands, and one process can have several people.
Weekly-off rules (FIXED or PREFERRED), leaves (LEAVE or COMP_OFF, approved or pending), holidays and coverage overrides (per date or per weekday) each have their own collection.
Each month has one Roster, with one RosterEntry per employee per day. A flag marks entries edited by hand.
A process’s calendar says when the client needs cover. An entry says what one person does that day. I kept these separate on purpose.

2. How does your system generate a roster and check the constraints?

It loads the month’s data in one batch and hands it to a pure scheduling module with no database code in it.
Daily status: for each person and day it applies, in order, a hand edit, then approved leave, then a fixed weekly off, then work, then a holiday, then unassigned, then process closed.
Weekly offs: in each full Monday–Sunday week, anyone without a rest day gets one off. The engine only picks a day where every process that person works still meets its minimum.
Long runs: if someone would work more than 6 days in a row, a repair step adds an extra off where coverage allows.
Coverage check: it counts working staff per process per day and compares them with the requirement.
Validation: it re-checks the saved roster, including manual edits, against the same rules. Generation and validation use the same engine.

3. How did you handle single-resource brands versus brands with several employees?

There is no special code path. The same coverage rule applies to both.
On a single-person brand that must run 365 days, no day off is ever safe. The person keeps working, and the system raises WEEKLY_OFF_NOT_POSSIBLE. It adds MAX_CONSECUTIVE_DAYS_EXCEEDED when the person ends up working more than 6 days in a row.
On a brand with several people, offs are spread so that coverage never drops below the minimum.
The sample data has 24 brands, 19 of them single-person (79%). It also has a two-person brand, a 365-day brand and a person who works across two brands.

4. What happens when the only person on a brand is unavailable on a required day?

Their leave or fixed off is respected, and nobody is silently moved onto the brand.
The system reports INSUFFICIENT_STAFF with the brand, process, date and the person’s name and reason.
It lists suggested replacements: someone free who already works another process of the same brand, then someone from the same pod, then anyone free.
POST /api/rosters/:id/leave-impact previews this before a leave is approved and saves nothing.

5. How does your system handle conflicting requirements or insufficient staffing?

Priority is client coverage and approved leave first, then fixed weekly offs, then the 6-day limit, then preferences.
A preferred off can be overridden, with a PREFERRED_OFF_USED warning.
Nothing is dropped silently. Every problem becomes a named error or warning, and the message says who, where and when.
Errors block publishing. Warnings don’t.

6. Which parts did you automate, and which did you leave under human control? Why?

Automated:
daily statuses
weekly-off placement
long-run repair
conflict detection
replacement ranking
leave what-if previews
Left to people:
approving leave
creating a new assignment so someone can cover a process
manual edits, which are locked when the roster is regenerated
the final publish
Why: assigning someone to a process changes who answers to a client, so a person has to decide that.

7. If the company doubled its team and brand count, what would you change?

Run generation as a background job instead of inside the web request.
Generate per pod, and cache the roster views for each month.
Add database indexes on roster entries by month and date, and paginate the entries.
Replace the weekly-off step, which is greedy, with a proper constraint solver, because larger teams have more hidden cases where a greedy choice misses a valid plan.

8. If you had one more week, what would you improve first?

First, carry over the working-day count from the previous month. Today the 6-day limit starts counting on the 1st, and on your seed data a month that starts mid-week still produces a few extra offs.
Next, a fairness score so that late weekly offs and busy Sundays are shared out across months.
Then pod-lead approval and notifications when a published roster changes.