# Apply historical attendance estimate Task Specification

*BUS 4498 Team Build Milestone 1. Create one copy for each L3 task. Save it in `our_team_agent/agent/task-specs/` in `BUS4498_Team_Build`. Use the task name in lowercase with hyphens between words; replace `&` with `and` and remove other punctuation.*

*Keep the exact task ID and name from the workflow. Complete all six sections, including Tool Permissions and Boundaries. The reason for assigning L3 belongs only in the team worksheet. Replace prompts and remove template instructions before submitting. Tool scripts are not required.*

```yaml
# BASIC INFORMATION
task_id: "T5"
task_name: "Apply historical attendance estimate"
task_owner: "System agent"

# Agent Inference Configuration
Provider: OpenAI
Model: gpt-5.6-luna
Role: Role: Analyze nonresponse attendance evidence, estimate attendance likelihood, and recommend whether to update the estimate or hand off the case for CPVC organizer review.
Maximum inference requests per task run: 6
On inference failure or exhausted limits: Escalate the case to the CPVC Event Planning Lead or organizer review queue. Do not update the attendance estimate or take further autonomous action.

## 1. Task Goal

- **Objective:** Estimate the likelihood that a registered student who has not responded to the attendance confirmation request will attend the Hackathon, so CPVC organizers can create a more accurate attendance estimate for food, drinks, and swag.

## 2. Inbound Inputs

### Input 1

- **Input name:** Registration record
- **What it contains:** The student's basic registration information and registration dat
- **Source:** T1: Record Registration

### Input 2

- **Input name:** Confirmation Response Status
- **What it contains:** Whether the student responded to the confirmation request by the response deadline
- **Source:** T2: Send Confirmation Request and D1: Did the student respond?

### Input 3

- **Input name:** Historical attendance information
- **What it contains:** CPVC's previous registration to attendance rate, including the approximately 40% attendance rate from the prior event
- **Source:** CPVC's past event attendance records

## 3. Tool Permissions and Boundaries

*Name each planned tool and specify its permitted use. Use verb-object names, such as `retrieve_records`, usually matching the task or permitted subtask it supports. Tool name identifies the capability; tool type identifies the proposed implementation. No scripts or working integrations are required.*

### Task-Wide Limits

- **Total task timeout:** 2 minutes, including all tool calls, retries, and waitings
- **Maximum tool calls:** 4 total calls across all tools during one task run

### Tool 1

### Tool 1

- **Tool name:** retrieve_registration_record
- **Input:** Registration record
- **Output:** Student registration details and registration date
- **Implementation Route:** Database queries
- **Integration approach:** Direct integration
- **Role in this task:** Supports the 'Review registration record' subtask.
- **Task timeout:** 30 seconds
- **Maximum retries:** 1
- **Retry only when:** The database connection or query fails before returning any record; retry once after 10 seconds. Do not retry if a record is returned but is incomplete.
- **On timeout, exhausted retries, or an error that cannot be retried:** Record that the registration record is unavailable and escalate the case to the CPVC Event Planning Lead.
*Copy the Tool block as needed. Tool-specific and task-wide limits both apply; stop at whichever is reached first. Naming a tool does not authorize uses outside its stated permissions.*

### Tool 2

- **Tool name:** retrieve_confirmation_status
- **Input:** Confirmation-response status
- **Output:** Student response status or no-response status
- **Implementation Route:** Database queries
- **Integration approach:** Direct integration
- **Role in this task:** Supports the 'Review registration record' subtask.
- **Task timeout:** 30 seconds
- **Maximum retries:** 1
- **Retry only when:** The database connection or query fails before returning a status; retry once after 10 seconds. Do not retry if the status is missing or unclear.
- **On timeout, exhausted retries, or an error that cannot be retried:** Record that confirmation status is unavailable and escalate the case to the CPVC Event Planning Lead.

### Tool 3

- **Tool name:** retrieve_attendance_history
- **Input:** Historical attendance information
- **Output:** Approved past registration-to-attendance rate
- **Implementation Route:** Database queries
- **Integration approach:** Direct integration
- **Role in this task:** Supports the 'Compare attendance evidence' subtask.
- **Task timeout:** 30 seconds
- **Maximum retries:** 1
- **Retry only when:** The database connection or query fails before returning approved historical data; retry once after 10 seconds. Do not retry if the data is conflicting or unavailable.
- **On timeout, exhausted retries, or an error that cannot be retried:** Record that historical-attendance information is unavailable and escalate the case to the CPVC Event Planning Lead.

## 4. How the Agent Should Reason

### Permitted Subtask 1

- **Subtask name:** Review registration record
- **Subtask description:** Examine the student's basic registration information, registration date, and confirmation response status to identify whether the student did not respond.
- **Subtask boundary:** The agent may use only the registration record and confirmation status provided as inputs; it may collect additional private information or contact the student.
- **Retry limits:** One attempt; if required registration or response information is missing, hand the case to a CPVC organizer.

### Permitted Subtask 2

- **Subtask name:** Compare attendance evidence
- **Subtask description:** Compare the nonresponse status with CPVC's historical attendance rate to produce an initial attendance likelihood estimate.
- **Subtask boundary:** The agent may use approved historical attendance records only, it may not invent data or treat the estimate as a confirmed attendance decision
- **Retry limits:** One attempt; if historical attendance information is unavailable or conflicting, flag case for human review. 

### Permitted Subtask 3

- **Subtask name:** Select next action
- **Subtask description:** Use the registration review and attendance estimate to decide whether to record the estimate or flag an unusual case for organizer review
- **Subtask boundary:** The agent may update the attendance likelihood record for request human review, it many not remove a student's registration, make final supply purchases, or send additional messages without organizer approval.
- **Retry limits:** One attempt; if the evidence does not support a clear action, send the case to a CPVC organizer

- **Decision guidance:** After each subtask, use its findings to select the permitted subtask most likely to resolve the most important remaining uncertainty. Do not follow a fixed sequence. If no permitted subtask can make useful progress, stop and hand the case to a person.

## 5. When to Stop or Hand Off to a Human

- **Stop successfully when:** The agent has recorded an attendance likelihood estimate for the non-responsive student using the available registration, confirmation status, and approved historical attendance information.
- **Hand off early when:** Required registration, response status, or historical attendance information is missing or conflicting, the case is unusual, or the agent cannot produce an estimate within its permitted one attempt.
- **Hand off to:** The CPVC Event Planning Lead or to the CPVC organizer review queue

Stop at the first applicable budget limit or handoff condition. While awaiting review, take no further autonomous action.

## 6. Outbound Deliverable

- **Status:** Completed or escalated to human.
- **Result or recommendation:** The completed result. If escalated before reaching a supported result, write undetermined. The student's estimated attendance likelihood, such as high, moderate, or low.
- **Evidence summary:** The registration status, confirmation response status, and relevant approved historical attendance information used for the estimate.
- **Subtasks performed:** Permitted subtasks completed, including repeated attempts.
- **Unresolved issues:** Remaining uncertainties or questions; use none only if no unresolved issue remains.
- **Handoff note:** Reason for stopping, unresolved questions, and what the reviewer needs to decide; write "Not applicable" for a completed task.
- **Next task or recipient:** T6:Update attendance estimate for completed cases; Unresolved cases go to the handoff recipient above.
