# Agile Artifacts - BMTC Transit App

## Product Backlog Template

### Epic Template
```
Epic: [Epic Name]
Epic Owner: [Product Owner/Stakeholder]
Business Value: [High/Medium/Low]
Estimated Story Points: [Total estimate]
Start Date: [Target start]
Target Completion: [Target end]

Description:
[Brief description of the epic and its business value]

Acceptance Criteria:
- [ ] [High-level acceptance criteria]
- [ ] [Another criteria]

User Stories:
- US-XXX: [User story title]
- US-XXX: [User story title]

Dependencies:
- [List any dependencies on other epics or external factors]

Definition of Done:
- [ ] All user stories completed
- [ ] Epic-level acceptance criteria met
- [ ] Performance criteria satisfied
- [ ] Security requirements validated
```

### User Story Template
```
User Story ID: US-XXX
Epic: [Parent Epic]
Story Points: [Fibonacci: 1,2,3,5,8,13,21]
Priority: [High/Medium/Low]
Sprint: [Target Sprint]

Title: As a [user type], I want [goal] so that [benefit]

Description:
[Detailed description of the user story]

Acceptance Criteria:
- [ ] Given [context], when [action], then [outcome]
- [ ] [Additional criteria]
- [ ] [Additional criteria]

Technical Tasks:
- [ ] [Technical task 1]
- [ ] [Technical task 2]
- [ ] [Technical task 3]

Definition of Done:
- [ ] Code complete and reviewed
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] User acceptance criteria verified
- [ ] Performance criteria met
- [ ] Security review completed
- [ ] Documentation updated

Dependencies:
- [List dependencies on other stories or external factors]

Notes:
[Any additional notes or considerations]
```

## Sprint Planning Templates

### Sprint Goal Template
```
Sprint [Number]: [Sprint Name]
Duration: [Start Date] - [End Date]
Team Velocity: [Previous sprint velocity]
Team Capacity: [Available person-hours]

Sprint Goal:
[Clear, concise statement of what the sprint aims to achieve]

Success Criteria:
- [Measurable criteria 1]
- [Measurable criteria 2]
- [Measurable criteria 3]

Committed Stories:
- US-XXX ([Story Points]): [Story Title]
- US-XXX ([Story Points]): [Story Title]
Total Committed Points: [Sum of story points]

Sprint Risks:
1. Risk: [Description]
   Mitigation: [Mitigation strategy]
   Owner: [Team member responsible]

2. Risk: [Description]
   Mitigation: [Mitigation strategy]
   Owner: [Team member responsible]

Key Dependencies:
- [Dependency 1] - Owner: [Name] - Due: [Date]
- [Dependency 2] - Owner: [Name] - Due: [Date]
```

### Daily Standup Template
```
Date: [Current Date]
Sprint: [Current Sprint]
Scrum Master: [Name]

Team Updates:

[Team Member 1]:
- Yesterday: [What was accomplished]
- Today: [What will be worked on]
- Blockers: [Any impediments]

[Team Member 2]:
- Yesterday: [What was accomplished]
- Today: [What will be worked on]
- Blockers: [Any impediments]

Sprint Burndown:
- Remaining Story Points: [Number]
- Days Remaining: [Number]
- On Track: [Yes/No/At Risk]

Action Items:
- [ ] [Action item] - Owner: [Name] - Due: [Date]
- [ ] [Action item] - Owner: [Name] - Due: [Date]

Next Meeting: [Date and Time]
```

## Definition of Ready (DoR)

### User Story DoR Checklist
A user story is ready for sprint planning when:

- [ ] **Clear User Value**: Story clearly describes user value and business benefit
- [ ] **INVEST Criteria Met**:
  - Independent: Can be developed independently
  - Negotiable: Details can be discussed and refined
  - Valuable: Provides clear value to users or business
  - Estimable: Team can estimate effort required
  - Small: Can be completed within one sprint
  - Testable: Clear acceptance criteria allow for testing

- [ ] **Acceptance Criteria Defined**: Clear, testable acceptance criteria written
- [ ] **Dependencies Identified**: All dependencies mapped and understood
- [ ] **Technical Feasibility**: Technical approach discussed and agreed upon
- [ ] **Design Assets Available**: UI/UX designs available if needed
- [ ] **Estimation Completed**: Story pointed by the team
- [ ] **Priority Assigned**: Product Owner has prioritized the story

### Epic DoR Checklist
An epic is ready for breakdown when:

- [ ] **Business Case Clear**: Business value and ROI understood
- [ ] **User Journey Mapped**: End-to-end user experience designed
- [ ] **Technical Architecture**: High-level technical approach defined
- [ ] **Acceptance Criteria**: Epic-level acceptance criteria defined
- [ ] **Rough Estimation**: Ballpark estimate for epic size
- [ ] **Dependencies Mapped**: Major dependencies identified

## Definition of Done (DoD)

### Story Level DoD
A user story is considered done when:

- [ ] **Code Complete**: All code written and committed to version control
- [ ] **Code Review**: Code reviewed and approved by at least one other developer
- [ ] **Unit Tests**: Unit tests written with >80% code coverage
- [ ] **Integration Tests**: Integration tests written and passing
- [ ] **Acceptance Criteria**: All acceptance criteria verified and passing
- [ ] **Manual Testing**: Story manually tested by QA
- [ ] **Performance**: Performance requirements met (if applicable)
- [ ] **Security**: Security requirements validated (if applicable)
- [ ] **Documentation**: Technical documentation updated
- [ ] **User Documentation**: User-facing documentation updated (if applicable)
- [ ] **Accessibility**: WCAG 2.1 AA compliance verified (if applicable)
- [ ] **Cross-browser/device**: Tested on target browsers/devices
- [ ] **Product Owner Approval**: Story accepted by Product Owner

### Sprint Level DoD
A sprint is considered done when:

- [ ] **All Stories Complete**: All committed stories meet story-level DoD
- [ ] **Sprint Goal Achieved**: Sprint goal has been met
- [ ] **No Critical Bugs**: No critical or high-severity bugs remain
- [ ] **Performance Targets**: Sprint performance targets achieved
- [ ] **Security Review**: Security requirements validated for sprint deliverables
- [ ] **Documentation Updated**: All relevant documentation updated
- [ ] **Demo Prepared**: Sprint review demo prepared and tested
- [ ] **Retrospective Completed**: Sprint retrospective conducted
- [ ] **Next Sprint Planned**: Next sprint planning completed

### Release Level DoD
A release is considered done when:

- [ ] **All Features Complete**: All planned features implemented and tested
- [ ] **User Acceptance Testing**: UAT completed successfully
- [ ] **Performance Testing**: Load and performance testing passed
- [ ] **Security Testing**: Security audit completed successfully
- [ ] **Accessibility Testing**: Accessibility compliance verified
- [ ] **Documentation Complete**: All user and technical documentation complete
- [ ] **Training Materials**: User training materials prepared
- [ ] **Support Procedures**: Support team trained and procedures in place
- [ ] **Monitoring**: Production monitoring and alerting configured
- [ ] **Rollback Plan**: Rollback procedures tested and documented

## Estimation Guidelines

### Story Point Scale (Fibonacci)
- **1 Point**: Trivial change, < 2 hours
  - Example: Update text label, fix typo
- **2 Points**: Simple change, < 4 hours
  - Example: Add validation to existing form field
- **3 Points**: Small feature, < 1 day
  - Example: Add new API endpoint with basic CRUD
- **5 Points**: Medium feature, 1-2 days
  - Example: Implement user registration flow
- **8 Points**: Large feature, 3-4 days
  - Example: Real-time location sharing functionality
- **13 Points**: Very large feature, 5+ days
  - Example: Complete ML validation pipeline
- **21 Points**: Epic-sized, needs breakdown
  - Example: Entire gamification system

### Planning Poker Guidelines
1. **Present Story**: Product Owner presents story and answers questions
2. **Discussion**: Team discusses technical approach and complexity
3. **Private Estimation**: Each team member selects points privately
4. **Reveal**: All estimates revealed simultaneously
5. **Discuss Differences**: Highest and lowest estimators explain reasoning
6. **Re-estimate**: Repeat until consensus reached
7. **Record**: Final estimate recorded with reasoning

## Sprint Tracking Templates

### Sprint Burndown Chart Data
```
Day | Date | Ideal Remaining | Actual Remaining | Stories Completed
1   | [Date] | [Points] | [Points] | [Story IDs]
2   | [Date] | [Points] | [Points] | [Story IDs]
...
15  | [Date] | 0 | [Points] | [Story IDs]
```

### Velocity Tracking
```
Sprint | Committed Points | Completed Points | Velocity | Team Capacity
1 | [Points] | [Points] | [Points] | [Hours]
2 | [Points] | [Points] | [Points] | [Hours]
3 | [Points] | [Points] | [Points] | [Hours]
Average Velocity: [Calculate rolling average]
```

### Risk and Issue Tracking
```
Risk/Issue ID: [Unique ID]
Type: [Risk/Issue]
Severity: [High/Medium/Low]
Probability: [High/Medium/Low] (for risks)
Description: [Detailed description]
Impact: [Potential impact on sprint/project]
Owner: [Responsible team member]
Status: [Open/In Progress/Resolved/Closed]
Mitigation/Resolution: [Actions taken or planned]
Date Raised: [Date]
Date Resolved: [Date]
```

## Retrospective Templates

### Sprint Retrospective Template
```
Sprint: [Sprint Number]
Date: [Date]
Participants: [Team members present]
Facilitator: [Scrum Master]

What Went Well:
- [Positive item 1]
- [Positive item 2]
- [Positive item 3]

What Didn't Go Well:
- [Challenge 1]
- [Challenge 2]
- [Challenge 3]

Action Items:
- [ ] [Action to improve] - Owner: [Name] - Due: [Date]
- [ ] [Action to improve] - Owner: [Name] - Due: [Date]
- [ ] [Action to improve] - Owner: [Name] - Due: [Date]

Start Doing:
- [New practice to adopt]
- [New practice to adopt]

Stop Doing:
- [Practice to discontinue]
- [Practice to discontinue]

Continue Doing:
- [Successful practice to maintain]
- [Successful practice to maintain]

Team Satisfaction Score: [1-5 scale]
Process Improvement Score: [1-5 scale]
```

### Release Retrospective Template
```
Release: [Release Name/Version]
Duration: [Start Date] - [End Date]
Team: [Team members]

Release Goals Achievement:
- Goal 1: [Achieved/Partially Achieved/Not Achieved]
- Goal 2: [Achieved/Partially Achieved/Not Achieved]
- Goal 3: [Achieved/Partially Achieved/Not Achieved]

Key Metrics:
- Planned Story Points: [Number]
- Delivered Story Points: [Number]
- Delivery Efficiency: [Percentage]
- Quality Metrics: [Bug count, defect rate, etc.]
- User Satisfaction: [Score/Feedback]

What Worked Well:
- [Release-level success 1]
- [Release-level success 2]
- [Release-level success 3]

Areas for Improvement:
- [Improvement area 1]
- [Improvement area 2]
- [Improvement area 3]

Lessons Learned:
- [Lesson 1]
- [Lesson 2]
- [Lesson 3]

Recommendations for Next Release:
- [Recommendation 1]
- [Recommendation 2]
- [Recommendation 3]
```

## Communication Artifacts

### Sprint Review Agenda Template
```
Sprint Review - Sprint [Number]
Date: [Date]
Duration: [Time allocation]
Attendees: [Stakeholders and team]

Agenda:
1. Sprint Overview (5 min)
   - Sprint goal recap
   - Team capacity and velocity
   
2. Demo of Completed Features (30 min)
   - [Feature 1] - Demo by [Team member]
   - [Feature 2] - Demo by [Team member]
   - [Feature 3] - Demo by [Team member]
   
3. Sprint Metrics (10 min)
   - Burndown chart review
   - Quality metrics
   - Performance metrics
   
4. Stakeholder Feedback (10 min)
   - Questions and feedback
   - Change requests
   
5. Next Sprint Preview (5 min)
   - Upcoming sprint goal
   - Key features planned

Action Items:
- [ ] [Action item] - Owner: [Name] - Due: [Date]
```

### Stakeholder Communication Template
```
Subject: Sprint [Number] Status Update - BMTC Transit App

Sprint Overview:
- Sprint Goal: [Goal statement]
- Duration: [Start] - [End]
- Team Velocity: [Points]

Key Accomplishments:
✅ [Major feature completed]
✅ [Major feature completed]
✅ [Major feature completed]

Upcoming Features (Next Sprint):
🔄 [Feature in next sprint]
🔄 [Feature in next sprint]
🔄 [Feature in next sprint]

Metrics:
- Stories Completed: [X/Y]
- Story Points Delivered: [X/Y]
- Sprint Goal Achievement: [%]
- Quality Score: [Metric]

Risks and Issues:
⚠️ [Risk/Issue description] - Mitigation: [Action]
⚠️ [Risk/Issue description] - Mitigation: [Action]

Next Milestone:
- [Milestone name]: [Target date]
- [Key deliverables]

Questions or feedback? Please reach out to [Product Owner] or join our Sprint Review on [Date].
```

This comprehensive set of Agile artifacts provides the framework for successful Scrum implementation throughout the BMTC Transit App development project.