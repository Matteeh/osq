# Fixture queue

Text above the first item is for people, and osq reads none of it.

## [alpha] The landed item

Depends on: nothing

Alpha brief.

## [beta] The planned item whose text changed

Depends on: alpha

Beta brief.

## [gamma] The approved item

Depends on: beta
Fixes: alpha

Gamma brief.

### Detail

A subheading stays in the item.

## [delta] The dead item with a rejection

Depends on: nothing

Delta brief.

## [epsilon] The twice rejected item

Depends on: nothing

Epsilon brief.

## [zeta] The unplanned item

Depends on: gamma, delta

Zeta brief.
