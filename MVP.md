# HM Trcc
## Minimum Viable Product (MVP) Specification

**Project Name:** HM Trcc  
**Project Type:** Hostel Management System  
**Primary Interface:** Admin Dashboard  
**Target Users:** Hostel Administrators, Wardens and Hostel Staff  
**Product Goal:** Build a centralized hostel management platform that simplifies student administration, room allocation, hostel operations, attendance, and communication.

---

# 1. PROJECT OVERVIEW

HM Trcc is a centralized hostel management platform designed to digitize and simplify everyday hostel administrative operations.

The system allows hostel administrators to manage students, rooms, leave applications, complaints, mess operations, QR-based meal verification, student movements, attendance, notices, staff, and reports through a single dashboard.

The platform should provide a simple, efficient, and professional administrative experience.

## Primary Objectives

- Centralize hostel administration.
- Reduce manual paperwork.
- Simplify student and room management.
- Digitize leave approval workflows.
- Improve complaint tracking and resolution.
- Manage mess bookings and meal verification.
- Track student entry and exit movements.
- Improve communication between administrators and students.
- Generate meaningful hostel operational reports.

# 2. TARGET USERS

### 2.1 Super Admin
- Complete system access.
- Manage administrators and staff.
- Configure hostel settings.
- View all operational information.
- Manage user permissions.

### 2.2 Warden
- Manage students.
- Allocate rooms.
- Approve or reject leave applications.
- Monitor student movements.
- Handle complaints.
- Publish notices.

### 2.3 Mess Staff
- View meal bookings.
- Manage meal-related operations.
- Scan student QR codes.
- View meal verification records.

### 2.4 Security Staff
- Record student entry and exit.
- Verify student movements.
- View movement history.
- Monitor late returns.

### 2.5 Maintenance Staff
- View assigned complaints.
- Update complaint progress.
- Add resolution remarks.
- Mark assigned complaints as resolved.

Role-based permissions must restrict users to their assigned responsibilities.

# 3. ADMIN DASHBOARD STRUCTURE

The admin dashboard contains three main navigation groups.

## MAIN MENU
1. Dashboard
2. Students
3. Rooms
4. Leave Management
5. Complaints

## OPERATIONS
6. Mess Management
7. QR Scanner
8. Movement & Attendance
9. Notices

## MANAGEMENT
10. Staff Management
11. Reports & Analytics
12. Settings

**Important:** Fee Management and fee collection are completely excluded from this project.

# 4. MODULE-WISE FUNCTIONAL REQUIREMENTS

## 4.1 Dashboard

Purpose: Provide a centralized overview of hostel operations.

### Statistics
- Total Students
- Total Rooms
- Occupied Rooms
- Available Beds
- Pending Leave Requests
- Open Complaints

### Dashboard Components
- Room occupancy visualization.
- Student attendance overview.
- Leave request summary.
- Complaint status overview.
- Today's mess booking statistics.
- Recent administrative activities.
- Quick action shortcuts.

### Functional Requirements
- Statistics must be fetched from actual backend data.
- Charts must update when underlying records change.
- Quick actions must navigate to the appropriate modules.
- Recent activities must reflect actual system events.

## 4.2 Student Management

Purpose: Maintain complete student records.

### Student Directory
- Student ID
- Full name
- Profile photograph
- Phone number
- Email
- Block
- Room number
- Student status

### Add Student
- Personal information.
- Date of birth.
- Contact information.
- Guardian information.
- Emergency contact.
- College information.
- Hostel admission details.
- Document uploads.

### Student Profile
- Personal details.
- Guardian details.
- Room allocation.
- Attendance history.
- Leave history.
- Complaint history.
- Meal booking history.

### Actions
- Add student.
- Edit student.
- View student.
- Allocate room.
- Transfer room.
- Deactivate student.

## 4.3 Room Management

Purpose: Manage hostel blocks, floors, rooms and bed availability.

### Room Overview
- Total rooms.
- Occupied rooms.
- Available rooms.
- Rooms under maintenance.

### Block Management
- Create blocks.
- Configure floors.
- View floor-wise rooms.

### Room Details
- Room number.
- Block.
- Floor.
- Room capacity.
- Occupied beds.
- Available beds.
- Assigned students.
- Room facilities.
- Maintenance status.

### Actions
- Add room.
- Edit room.
- Delete room when unoccupied.
- Allocate student.
- Transfer student.
- Vacate bed.
- Mark room under maintenance.

### Business Rules
- A room cannot exceed its configured capacity.
- A student cannot have multiple active room allocations.
- Occupancy must update automatically after allocation or transfer.
- Rooms under maintenance cannot receive new allocations.

## 4.4 Leave Management

Purpose: Digitize student leave applications and approvals.

### Leave Overview
- Total Requests.
- Pending Requests.
- Approved Requests.
- Rejected Requests.

### Leave Request Details
- Student information.
- Room number.
- Leave reason.
- Departure date and time.
- Expected return date and time.
- Guardian information.
- Supporting documents, if applicable.

### Actions
- View application.
- Approve leave.
- Reject leave with a reason.
- View leave history.
- Record actual departure.
- Record actual return.

### Business Rules
- Only authorized administrators can approve or reject requests.
- Rejected requests cannot be treated as approved leave.
- Every approval and rejection must be recorded.
- Approved leave should be connected to movement tracking.

## 4.5 Complaints Management

Purpose: Track and resolve hostel-related complaints.

### Complaint Categories
- Electrical.
- Plumbing.
- Cleaning.
- Wi-Fi.
- Food.
- Room maintenance.
- Other.

### Complaint Overview
- Total complaints.
- Open complaints.
- In-progress complaints.
- Resolved complaints.

### Complaint Details
- Complaint ID.
- Student details.
- Room number.
- Category.
- Description.
- Uploaded photographs.
- Priority.
- Assigned staff.
- Submission date.
- Resolution notes.

### Actions
- View complaint.
- Assign staff.
- Change priority.
- Update status.
- Add remarks.
- Resolve complaint.
- Reopen complaint.

### Complaint Status
- Open.
- Assigned.
- In Progress.
- Resolved.
- Reopened.

## 4.6 Mess Management

Purpose: Manage meal menus, bookings and daily mess operations.

### Mess Overview
- Breakfast bookings.
- Lunch bookings.
- Dinner bookings.
- Total bookings.
- Meals verified as served.

### Meal Management
- Breakfast menu.
- Lunch menu.
- Dinner menu.
- Edit daily menu.
- Publish menu.

### Meal Booking Management
Display three date categories:
- Yesterday.
- Today.
- Tomorrow.

Show:
- Student name.
- Student ID.
- Room number.
- Meal type.
- Booking status.
- Verification status.

### Booking Rules
- Booking opens at 6:00 AM.
- Booking closes at 7:00 PM.
- Students must book meals in advance.
- Students cannot book today's meal on the same day.
- Booking availability must follow the configured booking date.

### Mess Reports
- Daily meal bookings.
- Meal-wise consumption.
- Meals verified as served.
- Unused bookings.

## 4.7 QR Scanner

Purpose: Verify student meal bookings through QR codes.

### Scanner Interface
- Camera-based QR scanner.
- Manual student ID lookup.
- Current meal session.
- Scanner status.

### Verification Result
Display:
- Student name.
- Student ID.
- Room number.
- Meal type.
- Booking status.
- Verification result.

### Scan History
- Successful scans.
- Invalid QR codes.
- Expired bookings.
- Duplicate scans.
- Scan timestamps.

### Business Rules
- Only valid bookings can be verified.
- QR codes must be associated with the correct student and meal.
- Duplicate scans must be rejected.
- Expired or invalid QR codes must be rejected.
- Successful scans must update meal verification records.

## 4.8 Movement & Attendance

Purpose: Monitor student entry, exit and attendance.

### Movement Overview
- Students inside hostel.
- Students outside hostel.
- Expected returns.
- Late returns.

### Movement Register
- Student name.
- Student ID.
- Room number.
- Exit time.
- Expected return time.
- Actual return time.
- Movement status.

### Check-in / Check-out
- Search student.
- Verify student identity.
- Record exit.
- Record entry.
- Add remarks.

### Attendance
- Daily attendance.
- Present students.
- Absent students.
- Attendance history.
- Date-wise attendance reports.

### Movement History
- Individual student movement records.
- Date-wise records.
- Late-entry records.

### Business Rules
- Entry and exit events must have timestamps.
- Movement records must not be silently overwritten.
- Students already outside cannot be checked out again.
- Late returns must be identifiable.
- Approved leave records should be linked to relevant movements.

## 4.9 Notices

Purpose: Communicate important hostel announcements.

### Notice Overview
- Total notices.
- Published notices.
- Draft notices.
- Scheduled notices.

### Create Notice
- Notice title.
- Description.
- Category.
- Attachments.
- Target audience.
- Publication date.

### Notice Actions
- Create notice.
- Edit notice.
- Save draft.
- Publish notice.
- Schedule notice.
- Archive notice.
- Delete notice.

### Target Audience
- All students.
- Specific blocks.
- Specific groups.
- Selected students.

Published notices must be visible to their intended audience.

## 4.10 Staff Management

Purpose: Manage hostel staff and their responsibilities.

### Staff Overview
- Total staff.
- Active staff.
- Inactive staff.

### Staff Directory
- Staff ID.
- Full name.
- Photograph.
- Contact number.
- Designation.
- Assigned block.
- Status.

### Staff Profile
- Personal information.
- Contact information.
- Assigned responsibilities.
- Assigned complaints.
- Work history.

### Actions
- Add staff.
- Edit staff.
- Deactivate staff.
- Assign responsibilities.
- Assign roles.
- Manage permissions.

### Staff Roles
- Super Admin.
- Warden.
- Mess Staff.
- Security Staff.
- Maintenance Staff.

## 4.11 Reports & Analytics

Purpose: Provide useful operational reports.

### Student Reports
- Total students.
- Active students.
- Block-wise student distribution.

### Room Reports
- Room occupancy.
- Available beds.
- Block-wise occupancy.

### Attendance Reports
- Daily attendance.
- Monthly attendance.
- Late-entry statistics.

### Leave Reports
- Approved leaves.
- Rejected leaves.
- Pending requests.

### Complaint Reports
- Category-wise complaints.
- Resolution rate.
- Average resolution time.

### Mess Reports
- Meal bookings.
- Meals verified as served.
- Meal-wise consumption.

### Movement Reports
- Daily exits.
- Daily entries.
- Late returns.

### Export
- PDF reports.
- Excel reports.

Reports must be generated from actual system records.

## 4.12 Settings

Purpose: Configure the hostel management platform.

### Admin Profile
- Name.
- Email.
- Profile photograph.
- Password management.

### Hostel Configuration
- Hostel name.
- Blocks.
- Floors.
- Room configuration.

### User & Access Management
- Admin accounts.
- Staff accounts.
- Role management.
- Permission configuration.

### Notification Settings
- Leave notifications.
- Complaint notifications.
- Notice notifications.
- Return alerts.

### System Settings
- Hostel timings.
- Mess booking configuration.
- Attendance configuration.
- Security settings.

### Activity Logs
- User actions.
- Administrative changes.
- Staff activities.
- Timestamps.

# 5. CORE END-TO-END WORKFLOWS

The modules must work together instead of operating as isolated pages.

### Workflow 1: Student Admission and Room Allocation

Admin adds student → Enters student information → Selects available room → Allocates bed → Room occupancy updates → Student profile is created.

### Workflow 2: Leave Approval and Movement

Student submits leave request → Admin reviews request → Approves or rejects → Approved leave is reflected in movement records → Security records exit → Security records return.

### Workflow 3: Complaint Resolution

Student submits complaint → Admin reviews complaint → Assigns maintenance staff → Staff updates progress → Complaint is resolved → Student can view updated status.

### Workflow 4: Meal Booking and QR Verification

Student books meal in advance → System generates booking QR → Mess staff opens scanner → Scans QR → System validates booking → Meal is marked as served → Mess statistics update.

### Workflow 5: Student Movement

Security searches student → Verifies identity → Records exit → Student returns → Security records entry → Movement history updates.

### Workflow 6: Notice Publication

Admin creates notice → Selects target audience → Publishes notice → Intended students receive or see the announcement.

### Workflow 7: Staff Assignment

Admin creates staff account → Assigns role → Configures permissions → Staff accesses permitted modules → Staff performs assigned responsibilities.

# 6. GLOBAL UI/UX DESIGN SYSTEM

## Primary Design Reference

The user-provided hostel dashboard reference image is the primary visual direction for HM Trcc.

The interface should maintain the same visual identity throughout all modules.

### Layout
- Dark charcoal left sidebar.
- Light grey application background.
- White content surfaces.
- Header containing search, notifications and admin profile.
- Consistent content spacing.
- Rounded sidebar corners.
- Structured dashboard sections.

### Color Palette

| Purpose | Color | Hex |
|---|---|---|
| Sidebar | Charcoal | #222222 |
| Main Background | Light Grey | #F4F4F4 |
| Content Surface | White | #FFFFFF |
| Soft Blue | Blue | #B5DDEC |
| Soft Lime | Lime | #DDF58A |
| Soft Lavender | Lavender | #CEB5EF |
| Primary Text | Dark | #292929 |
| Secondary Text | Grey | #777777 |
| Borders | Light Grey | #E9E9E9 |

### Visual Direction
- Professional.
- Minimal.
- Structured.
- Information-focused.
- Clean typography.
- Controlled surface hierarchy.
- Subtle borders and shadows.
- Consistent iconography.

# 7. STRICT ANTI-AI-SLOP RULES

These rules are mandatory and non-negotiable.

## Prohibited Design Patterns

NEVER use:
- Unnecessary gradients.
- Neon colors.
- Glowing borders.
- Excessive glassmorphism.
- Random decorative shapes.
- Floating abstract elements.
- Excessive rounded cards.
- Rainbow-colored statistics.
- Excessive shadows.
- Unnecessary animations.
- Emoji-based navigation.
- Generic AI dashboard templates.
- Repetitive card layouts.
- Decorative illustrations.
- Oversized headings.
- Fake charts and fabricated analytics.

## Prohibited AI Components

Do not create:
- Fake AI assistant widgets.
- Unnecessary chatbot panels.
- Fake AI insights.
- Artificial recommendations.
- Decorative AI-generated summaries.
- Non-functional notification widgets.
- Fake progress indicators.
- Random activity feeds.
- Unnecessary components added only for visual appeal.

Never claim a feature is AI-powered unless it is genuinely implemented.

## Component Rules

- Every component must have a clear purpose.
- Every button must work.
- Every form must validate.
- Every search field must function.
- Every filter must affect results.
- Every chart must use real data or clearly identified development mock data.
- Every table action must perform its intended operation.
- Every empty state must be intentional.
- Every modal must support its intended workflow.
- Do not repeat the same layout across every module.

**Design principle:** If a component does not improve usability, information clarity or workflow efficiency, do not create it.

# 8. FUNCTIONAL REQUIREMENTS

The MVP must support:

- Authentication and authorization.
- Role-based access control.
- CRUD operations where appropriate.
- Database persistence.
- Form validation.
- Search and filtering.
- Sorting and pagination where needed.
- Status management.
- File uploads where required.
- Notifications for important events.
- Loading states.
- Empty states.
- Error handling.
- Confirmation dialogs for destructive actions.
- Audit logging for important administrative operations.

All data must persist in the database.

Do not rely on temporary frontend state for permanent records.

# 9. NON-FUNCTIONAL REQUIREMENTS

### Performance
- Fast page loading.
- Efficient database queries.
- Avoid unnecessary API requests.
- Optimize large tables.

### Security
- Secure authentication.
- Password hashing.
- Server-side authorization.
- Input validation.
- Protected administrative routes.
- Secure file uploads.
- Prevent unauthorized access to student information.

### Reliability
- Consistent database updates.
- Proper error handling.
- No duplicate room allocations.
- No duplicate meal verification.
- Maintain accurate movement records.

### Scalability
The initial system should be optimized for a small hostel environment of fewer than 200 students while keeping the architecture maintainable.

# 10. RESPONSIVE DESIGN REQUIREMENTS

Every module must work across:

- 320px mobile.
- 360px mobile.
- 390px mobile.
- 412px mobile.
- 430px mobile.
- Tablet.
- Desktop.
- Large desktop.

Requirements:
- Sidebar collapses on smaller screens.
- Tables use appropriate mobile layouts.
- Forms remain usable.
- No horizontal overflow.
- No overlapping elements.
- Dialogs fit mobile screens.
- Touch targets are accessible.

# 11. MVP DEVELOPMENT PRIORITIES

## Phase 1: Foundation
- Project setup.
- Database configuration.
- Authentication.
- Admin layout.
- Sidebar navigation.
- Header.
- Global design system.
- Role-based access control.

## Phase 2: Core Hostel Management
- Dashboard.
- Student Management.
- Room Management.
- Leave Management.
- Complaints Management.

## Phase 3: Hostel Operations
- Mess Management.
- QR Scanner.
- Movement & Attendance.
- Notices.

## Phase 4: Administration
- Staff Management.
- Reports & Analytics.
- Settings.

## Phase 5: Integration and Testing
- Connect all modules.
- Verify database persistence.
- Test all workflows.
- Test permissions.
- Test responsive layouts.
- Fix functional and UI bugs.

# 12. OUT OF SCOPE

The following are not part of the current MVP:

- Fee collection and payment management.
- Online payment gateway.
- Financial accounting.
- Advanced AI chatbot.
- AI-powered recommendations.
- Predictive analytics.
- Facial recognition.
- Biometric integration.
- Unnecessary enterprise-level functionality.

These features must not be added without explicit approval.

# 13. MVP ACCEPTANCE CRITERIA

The MVP is considered complete only when:

1. Admin can securely log in.
2. Role-based access works correctly.
3. Students can be created and managed.
4. Rooms and bed allocations work correctly.
5. Room occupancy updates automatically.
6. Leave requests can be reviewed and processed.
7. Complaints can be assigned and resolved.
8. Mess menus and bookings can be managed.
9. QR-based meal verification works.
10. Student movement and attendance records work.
11. Notices can be published to intended audiences.
12. Staff and permissions can be managed.
13. Reports display accurate information.
14. Settings are functional.
15. All data persists correctly.
16. All modules communicate correctly.
17. All pages are responsive.
18. No major UI or functional bugs remain.

# 14. FINAL DEVELOPMENT DIRECTIVE

Build HM Trcc as a complete, connected and production-minded hostel management platform.

The provided dashboard screenshot is the primary design reference.

Do not redesign the reference into a generic AI-generated SaaS dashboard.

Do not add unnecessary components, decorative elements, fake analytics or unrequested features.

Prioritize:
- Functional accuracy.
- Clean UI implementation.
- Consistent design.
- Real database integration.
- Reliable administrative workflows.
- Maintainable code.
- Responsive behavior.

**The final product must look like a professionally designed hostel management application, not an AI-generated UI template.**

Follow this MVP specification throughout development. Do not silently remove requirements, invent additional modules or change approved workflows.



# CRITICAL DIRECTIVE: PIXEL-PERFECT UI REPLICATION

## 1. REFERENCE IMAGE IS THE SOURCE OF TRUTH

The provided Hostel Dashboard screenshot is the exact visual blueprint for HM Trcc.

**Recreate the design as closely as technically possible, pixel by pixel.**

This is NOT a redesign task.
This is NOT an inspiration-based implementation.
This is NOT an opportunity to introduce your own design ideas.

The objective is to reproduce the reference image's visual appearance as faithfully as possible while replacing its rental-management content with HM Trcc functionality.

## 2. STRICT VISUAL MATCHING

Reproduce the following elements faithfully:

- Overall application dimensions and proportions.
- Dark left sidebar dimensions and positioning.
- Sidebar shape, corner radius and background.
- Logo positioning and typography.
- Navigation item spacing and alignment.
- Active navigation item's white background and shape.
- Header height and positioning.
- Search bar dimensions and appearance.
- Notification icon and profile positioning.
- Main content positioning.
- Statistics card dimensions, colors and spacing.
- White content panel backgrounds.
- Chart positioning and proportions.
- Table dimensions, row heights and separators.
- Typography sizes, weights and hierarchy.
- Border colors and corner radii.
- Chart colors, legends and labels.
- Internal padding and whitespace.

Do not approximate these elements unnecessarily. Use the reference image to measure their proportions.

## 3. EXACT COLOR REPLICATION

Use the colors extracted from the reference image as closely as possible.

- Sidebar: #222222
- Main background: #F4F4F4
- Content panels: #FFFFFF
- Blue statistic card: #B5DDEC
- Lime statistic card: #DDF58A
- Lavender statistic card: #CEB5EF
- Primary text: #292929
- Secondary text: #777777
- Borders: #E9E9E9

Do not introduce gradients, neon colors or additional decorative accent colors.

## 4. COMPONENT REPLICATION

Do not replace the reference components with generic alternatives.

Reproduce:
- Sidebar navigation.
- Header and search.
- Statistic cards.
- Bar chart panel.
- Donut chart panel.
- Data table.
- Dark analytics panel.
- Status indicators.
- Notification and profile controls.

Maintain their visual proportions and alignment.

## 5. HM TRCC CONTENT ADAPTATION

Replace the reference application's rental-related content with actual hostel-management information.

For example:

- Vacant Rooms → Available Beds.
- Received Complaints → Open Complaints.
- Total Tenants → Total Students.
- Newly Joined vs Left → Student Admissions vs Departures.
- Rent Status → Room Occupancy.
- Attendance → Student Attendance.
- Revenue Overview → Mess Overview.

Do not implement rent collection, financial accounting or fee management.

Keep the same visual structure while adapting the information.

## 6. NO CREATIVE DEVIATIONS

STRICTLY PROHIBITED:

- Changing the sidebar design.
- Changing the dashboard layout.
- Replacing the pastel palette.
- Adding gradient backgrounds.
- Introducing glassmorphism.
- Adding floating cards.
- Creating oversized headings.
- Adding unnecessary banners.
- Changing component proportions.
- Introducing generic AI dashboard templates.
- Adding decorative AI-generated components.
- Adding unnecessary animations.
- Replacing the design with a modernized interpretation.

Do not improve, simplify, modernize or reinterpret the reference design without explicit approval.

## 7. IMPLEMENTATION REQUIREMENTS

- Build reusable components matching the reference.
- Maintain consistent styling across all modules.
- Use actual application data.
- Preserve existing business logic and functionality.
- Ensure navigation and interactions work.
- Maintain responsive behavior without changing the desktop reference composition.
- Do not rebuild existing functionality unnecessarily.

For secondary pages, preserve the exact application shell, sidebar, header, typography, colors, surfaces and component styling. Adapt only the content layout required by each module.

## 8. VISUAL QUALITY VERIFICATION

After implementation:

1. Compare the developed dashboard against the reference screenshot.
2. Check sidebar width and positioning.
3. Check header alignment.
4. Compare statistic card dimensions.
5. Compare chart panel proportions.
6. Compare table spacing and typography.
7. Verify color accuracy.
8. Verify component alignment.
9. Fix visible differences.
10. Repeat until the result closely matches the reference.

**FINAL INSTRUCTION: REPLICATE THE REFERENCE DESIGN. DO NOT CREATE YOUR OWN DESIGN. VISUAL FIDELITY IS THE HIGHEST UI PRIORITY.**






![alt text](image.png) This the reference image.