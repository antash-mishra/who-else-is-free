package main

import (
    "database/sql"
    "fmt"

    _ "modernc.org/sqlite"
)

// openDB establishes a SQLite connection with sane defaults for this app.
func openDB(path string) (*sql.DB, error) {
    dsn := fmt.Sprintf("file:%s?_foreign_keys=on&_busy_timeout=5000", path)

    conn, err := sql.Open("sqlite", dsn)
    if err != nil {
        return nil, fmt.Errorf("open sqlite: %w", err)
    }

    conn.SetConnMaxLifetime(0)
    conn.SetMaxIdleConns(10)
    conn.SetMaxOpenConns(1)

    if err := conn.Ping(); err != nil {
        _ = conn.Close()
        return nil, fmt.Errorf("ping sqlite: %w", err)
    }

    return conn, nil
}
