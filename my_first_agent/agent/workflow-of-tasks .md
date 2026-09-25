# Workflow of Tasks

*Replace all bracketed prompts with information specific to your proposed system. Delete instructional text that does not belong in your final specification. Add or remove task sections as needed. Every task shown in the general workflow must have a corresponding task specification below.*

## 1. Workflow Overview
### 1.1 Workflow Goal
This workflow supports the system goal defined in `my_first_agent/README.md`.

### 1.2 Workflow Trigger

A student will submit a registration for the CPVC Hackathon

### 1.3 Completion Condition at Runtime

The workflow is complete when the student's valid registration has been recorded in the Hackathon attendance list and the student has received a registration confirmation. If the registration cannot be processed automatically, the workflow is complete when the system updates student's attendance staus or likelihood of attending in the attendance planning list

### 1.4 General Workflow

When a student submits the CPVC Hackathon registration form, the form will collect the student's basic registration information and check that all required fields are complete and valid. As the event approaches, the system sends one purposeful attendance confirmation message asking students whether they still plan to attend. If the student confirms attendance, the system will mark them as confirmed and update automatically the estimated attendance total. If student indicates they cannot attend, the system makes them as not attending and removes them from expected attendance total. If the student does not respond, the system keeps their status as no repsonse and uses the club's historical attendance rate to estimate whether they will attend. CPVC organizers can review unclear or unusual responses before final food, drink, and swag quantities are planned. 

### 1.5 Workflow Diagram

```mermaid
flowchart TD
    A[Student submits Hackathon registration] --> T1[T1: Record registration]
    T1 --> T2[T2: Send confirmation request]
    T2 --> D1{D1: Did student respond?}

    D1 -->|Yes| D2{D2: Will student attend?}
    D2 -->|Yes| T3[T3: Mark confirmed attendance]
    D2 -->|No| T4[T4: Mark unlikely attendance]

    D1 -->|No| T5[T5: Apply historical attendance estimate]
    T5 --> D3{D3: Is organizer review needed?}
    D3 -->|Yes| T7[T7: Review registration]
    D3 -->|No| T6[T6: Update attendance estimate]
    T7 --> T6

    T3 --> T6
    T4 --> T6
    T6 --> C1[Completion]
