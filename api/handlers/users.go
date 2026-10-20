package handler

import (
	"net/http"
	"encoding/json"

	"github.com/EdwardVNguyen/ChessNotes/api/utils"
	"github.com/EdwardVNguyen/ChessNotes/api/internal/database"
	"github.com/google/uuid"
)

type User struct {
	ID uuid.UUID `json:"id"`
	Email string `json:"email"`
}

func (cfg *ApiConfig) HandleCreateUser(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		Email string `json:"email"`
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


	if err := cfg.Db.CreateUser(r.Context(), database.CreateUserParams{
		Email: p.Email,
		PasswordHash: p.Password, // todo, currently set as unhashed password for now
	},
	); err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "Could not create user", err)
		return
	}

	user, err := cfg.Db.GetUserByEmail(r.Context(), p.Email)
	if err != nil {
		utils.RespondError(w, http.StatusInternalServerError, "User email could not be found", err)
		return
	}

	utils.RespondJSON(w, http.StatusCreated, User{
		Email: user.Email,
	})
}
