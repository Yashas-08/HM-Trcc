# STRICT UI/UX RULES — NO AI-GENERATED DESIGN

These rules are mandatory for every page, component, interaction, and responsive layout in Hostel Flow Admin Dashboard.

## 1. DESIGN INTEGRITY
- Follow the provided Hostel Management Dashboard reference image as the primary visual direction.
- Do not independently invent a new visual identity.
- Maintain consistent visual language across all modules.
- Design must look like a professionally designed, production-grade SaaS product.
- Avoid generic AI-generated dashboard aesthetics.

## 2. STRICTLY PROHIBITED DESIGN PATTERNS

NEVER generate:
- Unnecessary gradient backgrounds.
- Glowing borders, neon effects or glassmorphism.
- Excessive rounded cards and pill-shaped containers.
- Random floating decorative elements.
- Oversized headings and unnecessary whitespace.
- Rainbow-colored statistics cards.
- Excessive shadows and artificial elevation.
- Repetitive card grids for every section.
- Generic landing-page layouts inside admin pages.
- Decorative blobs, abstract shapes or background patterns.
- Fake charts containing arbitrary data.
- Unnecessary welcome banners and promotional sections.
- Emoji-based navigation icons.
- AI-generated illustrations used as filler.
- Excessive badges for ordinary information.
- Repeated section headers such as "Your Overview", "Everything at a glance" or "Welcome back, Admin".

## 3. NO GENERIC AI COMPONENTS

Do not generate components simply to make the interface look visually impressive.

Every component must serve a real administrative purpose.

Avoid:
- Unnecessary AI assistant widgets.
- Fake AI insights and recommendations.
- Chatbot panels without an actual implemented feature.
- Decorative activity feeds with fabricated records.
- Fake notification counters.
- Non-functional search bars.
- Buttons that do nothing.
- Fake interactive charts.
- Random progress indicators.
- Placeholder analytics presented as real data.
- Unnecessary AI-generated summaries.
- Duplicate information displayed in multiple components.

Never label a feature as AI-powered unless its actual functionality is implemented and connected to a working AI service.

## 4. COLOR SYSTEM

Follow the reference image's controlled color palette.

- Primary sidebar: #222222
- Main background: #F4F4F4
- Content surfaces: #FFFFFF
- Soft blue: #B5DDEC
- Soft lime: #DDF58A
- Soft lavender: #CEB5EF
- Primary text: #292929
- Secondary text: #777777
- Borders: #E9E9E9

Rules:
- Use pastel colors only where they communicate information.
- Do not introduce additional accent colors without a functional reason.
- Use red for errors and destructive states.
- Use green for successful or completed states.
- Maintain sufficient contrast and accessibility.

## 5. COMPONENT DESIGN RULES

- Use consistent component dimensions and spacing.
- Prefer simple rectangular content surfaces with controlled corner radii.
- Use subtle borders instead of excessive shadows.
- Use professional typography with a clear hierarchy.
- Use Lucide icons consistently.
- Icons must have consistent sizes and stroke weights.
- Tables must prioritize readability and information density.
- Forms must use properly aligned labels and inputs.
- Modals must be compact and task-focused.
- Dropdowns and filters must behave consistently.
- Status indicators must have consistent semantic colors.

Do not turn every piece of information into a separate card.

## 6. REAL FUNCTIONALITY ONLY

- Every button must perform its intended action.
- Every form must validate input.
- Every search field must search actual records.
- Every filter must affect displayed results.
- Every table action must work.
- Every chart must use actual backend data.
- Every notification must correspond to a real event.
- Every status must reflect the actual database state.
- Display loading, empty, success and error states properly.
- Never use fabricated data in production views.

If backend functionality is unavailable, clearly distinguish development mock data from real records.

## 7. PAGE-SPECIFIC DESIGN

Do not reuse the same page layout across every module.

Each module must have a layout appropriate to its purpose:

- Dashboard: Statistics, charts, attendance and recent activities.
- Students: Searchable student directory and detailed profiles.
- Rooms: Block/floor navigation and room occupancy visualization.
- Leave Management: Request queue and approval details.
- Complaints: Ticket management and resolution workflow.
- Mess Management: Meal menus and booking information.
- QR Scanner: Dedicated scanning interface.
- Movement & Attendance: Check-in/check-out records and movement logs.
- Notices: Notice editor and publication management.
- Staff Management: Staff directory and role assignments.
- Reports: Data visualizations and exportable reports.
- Settings: Structured configuration forms.

## 8. RESPONSIVE DESIGN

Test every page at:
- 320px
- 360px
- 390px
- 412px
- 430px
- Tablet
- Desktop
- Large desktop

Rules:
- No horizontal overflow.
- No overlapping elements.
- Tables must have an intentional mobile presentation.
- Sidebar must collapse appropriately on smaller screens.
- Dialogs must fit within mobile viewports.
- Touch targets must be accessible.

## 9. DEVELOPMENT RESTRICTIONS

- Do not rebuild the application from scratch.
- Do not change existing business logic unnecessarily.
- Do not modify database schemas, APIs, authentication or routes unless explicitly required.
- Reuse existing components where appropriate.
- Do not install unnecessary dependencies.
- Avoid duplicate components and CSS.
- Maintain clean, reusable and maintainable code.
- Preserve all existing working functionality.

## 10. FINAL QUALITY GATE

Before considering any page complete, verify:

1. Does it follow the supplied visual reference?
2. Does every component serve a real purpose?
3. Does it avoid generic AI dashboard patterns?
4. Is the typography consistent?
5. Are colors used intentionally?
6. Are all interactions functional?
7. Is the data accurate?
8. Does it work across all required screen sizes?
9. Does it look like a professionally designed human-made product?
10. Is there any unnecessary component that should be removed?

If a design element does not improve usability, information clarity or workflow efficiency, DO NOT ADD IT.

**FINAL DIRECTIVE: Build a functional hostel management product, not an AI-generated dashboard showcase. Prioritize usability, visual consistency, operational clarity and implementation quality over decorative aesthetics.**