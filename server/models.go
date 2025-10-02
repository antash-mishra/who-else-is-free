package main

import "time"

type Event struct {
    ID          int64     `json:"id"`
    Title       string    `json:"title"`
    Location    string    `json:"location"`
    Time        string    `json:"time"`
    Description string    `json:"description"`
    Gender      string    `json:"gender"`
    MinAge      int       `json:"min_age"`
    MaxAge      int       `json:"max_age"`
    DateLabel   string    `json:"date_label"`
    CreatedAt   time.Time `json:"created_at"`
}

type CreateEventParams struct {
    Title       string `json:"title" binding:"required,min=1"`
    Location    string `json:"location" binding:"required,min=1"`
    Time        string `json:"time" binding:"required,min=1"`
    Description string `json:"description"`
    Gender      string `json:"gender" binding:"required,min=1"`
    MinAge      int    `json:"min_age" binding:"required,gte=0"`
    MaxAge      int    `json:"max_age" binding:"required,gte=0"`
    DateLabel   string `json:"date_label" binding:"required,oneof=Today Tmrw"`
}
