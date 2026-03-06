<overview>
Core rules that apply to every file in every language. Every file scanned must be checked against all of them regardless of language. Language-specific rules layer on top.
</overview>

<rule id="srp" name="Single Responsibility Principle">
- File scope: A file should have one clear purpose. If a file mixes HTTP handlers, database queries, and business logic, flag it.
- Function scope: A function should do one thing. Heuristics:
  - More than 50 lines -> flag as Medium ("consider splitting")
  - More than 30 lines without type annotations (Python) -> flag as Medium (pet peeve #5)
  - More than 5 parameters -> flag as Low ("consider a config/options struct")
  - Function name contains "and" (e.g., validateAndSave) -> flag as Low
- Class/struct scope: More than 20 methods or 500 lines -> flag as Medium ("god class")
</rule>

<rule id="dry" name="Don't Repeat Yourself">
- Near-identical code blocks (3+ lines of substantively same logic) appearing in 2+ places -> Medium
- Same magic string or number used 3+ times across files -> Low ("extract to constant")
- Same validation logic duplicated across endpoints -> Medium ("extract to shared validator")
- Copy-pasted error handling blocks -> Low ("extract to helper")

Do NOT flag:
- Repeated import statements (that's normal)
- Similar but contextually different test assertions
- Boilerplate required by frameworks (e.g., Next.js route exports)
</rule>

<rule id="kiss" name="Keep It Simple">
- Deeply nested logic (4+ levels of if/for/match) -> Medium ("use early returns or extract")
- Ternary chains or nested ternaries -> Low ("use if/else for clarity")
- Over-engineered abstractions for a single use case -> Medium ("YAGNI -- inline this")
- Clever one-liners that sacrifice readability -> Low
</rule>

<rule id="yagni" name="You Aren't Gonna Need It">
- Unused exported functions/types (grep for references) -> Low
- Abstract interfaces with only one implementation and no test mocks -> Low ("premature abstraction")
- Feature flags or config options that are never toggled -> Low
- Commented-out code -> Medium (pet peeve #10 -- "delete it or make a ticket")
- Dead code after unconditional return/break/raise -> Low
</rule>

<rule id="ocp" name="Open/Closed Principle">
- Large switch/match statements dispatching on concrete types -> Medium ("consider polymorphism or registry pattern")
- Functions with growing if isinstance() / typeof / type assertion chains -> Medium
</rule>

<rule id="isp" name="Interface Segregation">
- Interfaces/traits with more than 7 methods -> Low ("consider splitting")
- Consumers that use less than 30% of an interface's methods -> Low ("narrow the dependency")
</rule>

<rule id="dip" name="Dependency Inversion">
- High-level modules directly instantiating low-level dependencies (e.g., db = PostgresDB() inside business logic) -> Medium ("inject the dependency")
- Hard-coded infrastructure choices in business logic (specific queue names, bucket names, URLs) -> Medium
</rule>

<rule id="soc" name="Separation of Concerns">
- UI code performing data transformation or business logic -> Medium (pet peeve #9 for dashboard)
- Data access logic mixed into HTTP handler functions -> Medium ("extract to repository/service layer")
- Configuration parsing mixed with runtime logic -> Low
</rule>

<rule id="error-handling" name="Error Handling">
- Swallowed errors (catch/except with no action) -> High
- Bare except: or catch {} without specific type -> Medium
- Error messages that leak implementation details or secrets -> High
- Missing error propagation (function can fail but caller ignores) -> Medium
- Inconsistent error wrapping (some errors wrapped with context, others bare) -> Low
</rule>

<rule id="naming" name="Clean Code and Naming">
- Single-letter variable names outside of loop indices or lambdas -> Low
- Misleading names (e.g., getUser that also modifies state) -> Medium
- Boolean function parameters without clear meaning (boolean trap) -> Low ("use named params or enum")
- Acronyms/abbreviations that aren't universally understood -> Low
</rule>

<rule id="documentation" name="Documentation">
- Public/exported items: Must have a doc comment (one-line summary minimum). Missing -> Low for functions, Medium for types/interfaces.
- Non-obvious parameters: Should have @param or equivalent when the name alone doesn't explain the expected value.
- Internal/private items: No doc comment required. Do NOT flag missing docs on private functions.
- Misleading or outdated comments: Worse than no comment -> Medium ("update or remove")
</rule>

<rule id="immutability" name="Immutability and Pure Functions">
- Mutable default arguments (Python def f(x=[])) -> High
- Functions that mutate input parameters without the caller expecting it -> Medium
- Global mutable state (package-level var in Go, module-level mutable in Python) -> Medium ("use dependency injection")
</rule>

<rule id="encapsulation" name="Law of Demeter / Encapsulation">
- Method chains longer than 3 calls (e.g., a.b().c().d().e()) -> Low ("consider intermediate variables or facade")
- Reaching into nested object internals (e.g., task.worker.container.config.memory) -> Medium
</rule>

<rule id="performance" name="Performance (non-premature)">
Only flag performance issues when there's a clear, measurable concern:
- Database/API calls inside loops -> High ("N+1 query pattern")
- Unbounded list/array growth without limits -> Medium
- String concatenation in loops (use builders/join) -> Low
- Missing pagination on endpoints that return collections -> Medium
</rule>

<rule id="dependency-hygiene" name="Dependency Hygiene">
- Unused imports -> Low
- Wildcard imports (from x import *, import * as) -> Medium
- Importing from a banned/deprecated module -> Medium
- Version-pinning issues in requirements/package files -> Low
</rule>

<rule id="boy-scout" name="Boy Scout Rule">
- TODO/FIXME/HACK/XXX comments -> Low ("convert to tracked issue")
- Commented-out code -> Medium (pet peeve #10)
- Dead code (unreachable branches, unused variables) -> Low
</rule>
