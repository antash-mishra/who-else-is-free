package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

const createTableUsers = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`

const createTableEvents = `
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    description TEXT,
    gender TEXT NOT NULL,
    min_age INTEGER NOT NULL,
    max_age INTEGER NOT NULL,
    date_label TEXT NOT NULL CHECK(date_label IN ('Today', 'Tmrw')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (min_age >= 0),
    CHECK (max_age >= min_age)
);
`

const insertEvent = `
INSERT INTO events (title, location, time, description, gender, min_age, max_age, date_label)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`

const insertUser = `
INSERT INTO users (name, email, password)
VALUES (?, ?, ?);
`

const selectEvents = `
SELECT id, title, location, time, description, gender, min_age, max_age, date_label, created_at
FROM events
ORDER BY created_at DESC;
`

const countEvents = `
SELECT COUNT(1)
FROM events;
`

const countUsers = `
SELECT COUNT(1)
FROM users;
`

const selectUserByEmail = `
SELECT id, name, email, password, created_at
FROM users
WHERE email = ?;
`

type EventRepository struct {
	db *sql.DB
}

func NewEventRepository(db *sql.DB) *EventRepository {
	return &EventRepository{db: db}
}

func (r *EventRepository) Init(ctx context.Context) error {
	if _, err := r.db.ExecContext(ctx, createTableUsers); err != nil {
		return fmt.Errorf("create users table: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, createTableEvents); err != nil {
		return fmt.Errorf("create events table: %w", err)
	}
	return nil
}

func (r *EventRepository) Create(ctx context.Context, params CreateEventParams) (int64, error) {
	res, err := r.db.ExecContext(ctx, insertEvent,
		params.Title,
		params.Location,
		params.Time,
		params.Description,
		params.Gender,
		params.MinAge,
		params.MaxAge,
		params.DateLabel,
	)
	if err != nil {
		return 0, fmt.Errorf("insert event: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("fetch event id: %w", err)
	}

	return id, nil
}

func (r *EventRepository) List(ctx context.Context) ([]Event, error) {
	rows, err := r.db.QueryContext(ctx, selectEvents)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	var events []Event

	for rows.Next() {
		var evt Event
		if err := rows.Scan(
			&evt.ID,
			&evt.Title,
			&evt.Location,
			&evt.Time,
			&evt.Description,
			&evt.Gender,
			&evt.MinAge,
			&evt.MaxAge,
			&evt.DateLabel,
			&evt.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, evt)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	return events, nil
}

var seedEvents = []CreateEventParams{
	{
		Title:       "Running Buddy",
		Location:    "Phoenix Park",
		Time:        "09:00",
		Description: "Morning run followed by coffee.",
		Gender:      "Any",
		MinAge:      20,
		MaxAge:      30,
		DateLabel:   "Today",
	},
	{
		Title:       "Live Music Night",
		Location:    "Workmans Club",
		Time:        "20:00",
		Description: "Indie bands and craft beers.",
		Gender:      "Female",
		MinAge:      22,
		MaxAge:      32,
		DateLabel:   "Today",
	},
	{
		Title:       "Trail Hike",
		Location:    "Howth Cliffs",
		Time:        "10:00",
		Description: "Scenic hike with lunch after.",
		Gender:      "Any",
		MinAge:      18,
		MaxAge:      40,
		DateLabel:   "Tmrw",
	},
}

func (r *EventRepository) EnsureSeedData(ctx context.Context) error {
	if err := r.ensureSeedUsers(ctx); err != nil {
		return err
	}
	return r.ensureSeedEvents(ctx)
}

type seedUser struct {
	Name     string
	Email    string
	Password string
}

var seedUsers = []seedUser{
	{
		Name:     "Ava Johnson",
		Email:    "ava@example.com",
		Password: "password123",
	},
	{
		Name:     "Liam Patel",
		Email:    "liam@example.com",
		Password: "welcome123",
	},
	{
		Name:     "Sophia Chen",
		Email:    "sophia@example.com",
		Password: "secret123",
	},
}

func (r *EventRepository) ensureSeedUsers(ctx context.Context) error {
	var count int
	if err := r.db.QueryRowContext(ctx, countUsers).Scan(&count); err != nil {
		return fmt.Errorf("count users: %w", err)
	}

	if count > 0 {
		return nil
	}

	for _, user := range seedUsers {
		if _, err := r.db.ExecContext(ctx, insertUser, user.Name, user.Email, user.Password); err != nil {
			return fmt.Errorf("seed user %q: %w", user.Email, err)
		}
	}

	return nil
}

func (r *EventRepository) ensureSeedEvents(ctx context.Context) error {
	var count int
	if err := r.db.QueryRowContext(ctx, countEvents).Scan(&count); err != nil {
		return fmt.Errorf("count events: %w", err)
	}

	if count > 0 {
		return nil
	}

	for _, evt := range seedEvents {
		if _, err := r.Create(ctx, evt); err != nil {
			return fmt.Errorf("seed event %q: %w", evt.Title, err)
		}
	}

	return nil
}

func (r *EventRepository) AuthenticateUser(ctx context.Context, email, password string) (*User, error) {
	var user User
	var storedPassword string
	if err := r.db.QueryRowContext(ctx, selectUserByEmail, email).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&storedPassword,
		&user.CreatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	if storedPassword != password {
		return nil, ErrInvalidCredentials
	}

	return &user, nil
}
