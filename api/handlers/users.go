package handler

import (
	"net/http"
	"encoding/json"

	"github.com/EdwardVNguyen/ChessNotes/api/utils"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
)

type User struct {
	ID int32 `json:"id"`
	Email string `json:"email"`
	Name string `json:"name"`
}

func (cfg *ApiConfig) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		Email string `json:"email"`
		Name string `json:"name"`
		Password string `json:"password"`
	}

	p := parameters{}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not read JSON from HTTP request body", err)
		return
	}

	// TODO: Hash password
	//
	//


	if p.Email == "" || p.Name == "" || p.Password == "" {
		utils.RespondError(w, http.StatusBadRequest, "email, name and password are required", nil)
		return
	}

	user, err := cfg.Db.CreateUser(r.Context(), database.CreateUserParams{
		Email: p.Email,
		Name: p.Name,
		PasswordHash: p.Password, // todo, currently set as unhashed password for now
	})
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}

	utils.RespondJSON(w, http.StatusCreated, User{
		ID: user.ID,
		Email: user.Email,
		Name: user.Name,
	})
}
