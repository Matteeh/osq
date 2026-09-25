# pricing Specification

## Purpose
Prices quotes by volume tier and percentage code, in integer cents.

## Requirements
### Requirement: Volume pricing
The engine SHALL price every unit in a quote at the tier its quantity falls in.
Follows ADR 001.

#### Scenario: Volume discount tiers
- **WHEN** a quote is calculated for a quantity
- **THEN** the unit price follows this table

| quantity | unit price |
|---|---|
| 1 | 10.00 |
| 99 | 10.00 |
| 100 | 9.00 |
| 499 | 9.00 |
| 500 | 8.00 |

### Requirement: Percentage codes
The engine SHALL take a percentage code off the tiered subtotal, not the list
price. Follows ADR 001.

#### Scenario: A percentage code comes off the tiered subtotal
- **WHEN** a quote for 200 units uses the code SAVE10
- **THEN** the subtotal is 1800.00
- **AND** the discount is 180.00
- **AND** the total is 1620.00
