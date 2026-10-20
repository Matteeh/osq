# Tasks

## 1. Atomic rebuild

- [x] 1. When the read model is rebuilt, every table is written in one transaction into a rebuild file that replaces the database only on success

## 2. Typed manifest

- [x] 2. When storage reads a change, it reads manifest.json into a typed Manifest and fails with a StorageError naming the file when it does not read

## 3. One frontmatter reader

- [x] 3. When storage reads frontmatter, it splits and parses it only with the specs kernel's parse_frontmatter
