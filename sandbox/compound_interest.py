# Compound Interest Calculator
# Formula: A = P(1 + r)^t

# Given values
P = 1000  # Principal amount in dollars
r = 0.05  # Annual interest rate (5%)
t = 3     # Time period in years

# Calculate final amount
A = P * (1 + r) ** t

# Calculate interest earned
interest_earned = A - P

# Display results
print("="*60)
print("COMPOUND INTEREST CALCULATION")
print("="*60)
print(f"\nGiven:")
print(f"  Principal (P) = ${P:,.2f}")
print(f"  Annual Rate (r) = {r*100}%")
print(f"  Time Period (t) = {t} years")
print(f"\nFormula: A = P(1 + r)^t")
print(f"\nStep-by-Step Calculation:")
print(f"  Step 1: Calculate (1 + r)")
print(f"          (1 + {r}) = {1 + r}")
print(f"\n  Step 2: Raise to power t")
print(f"          {1 + r}^{t} = {(1 + r)**t:.10f}")
print(f"\n  Step 3: Multiply by principal P")
print(f"          A = ${P:,.2f} × {(1 + r)**t:.10f}")
print(f"          A = ${A:,.2f}")
print(f"\nResults:")
print(f"  Final Amount (A) = ${A:,.2f}")
print(f"  Interest Earned = ${interest_earned:,.2f}")
print(f"\nYear-by-Year Breakdown:")
print(f"  Year 0: ${P:,.2f}")
for year in range(1, t + 1):
    amount = P * (1 + r) ** year
    year_interest = amount - P * (1 + r) ** (year - 1)
    print(f"  Year {year}: ${amount:,.2f} (interest this year: ${year_interest:,.2f})")
print("="*60)
