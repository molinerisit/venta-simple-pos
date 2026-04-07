# Audit Specification

## Objective
Evaluate system quality focusing on:
- Stability
- Performance
- Maintainability
- User Experience

---

## Areas to Analyze

### 1. Architecture
- Coupling between UI and logic
- Separation of concerns
- Modularity

### 2. Data Flow
- How data moves from UI → backend → DB
- State management issues

### 3. Database
- SQLite usage
- Query efficiency
- Data consistency

### 4. Performance
- Blocking operations
- Heavy renders
- Inefficient loops

### 5. Bugs
- Reproducible errors
- State inconsistencies

### 6. UX
- Friction in sales flow
- Number of steps
- Feedback to user

---

## Output Format

Each issue must include:

- Title
- Description
- Steps to reproduce
- Expected vs actual behavior
- Impact
- Possible cause (optional)