from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import current_user, get_or_404, require_admin
from ..models import User, UserSession
from ..schemas import LoginIn, PasswordChange, UserCreate, UserOut, UserUpdate
from ..security import hash_password, hash_token, login_throttle, new_session_token, verify_password

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    client = request.client.host if request.client else "?"
    keys = (f"u:{body.username.lower()}", f"ip:{client}")
    if any(login_throttle.blocked(k) for k in keys):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed attempts, try again in a few minutes")
    user = db.scalar(select(User).where(func.lower(User.username) == body.username.lower()))
    ok = verify_password(user.password_hash if user else None, body.password)
    if not ok or user is None or not user.is_active:
        for k in keys:
            login_throttle.failure(k)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    for k in keys:
        login_throttle.success(k)

    token, token_hash = new_session_token()
    now = datetime.now(UTC)
    db.execute(delete(UserSession).where(UserSession.expires_at < now))
    db.add(UserSession(token_hash=token_hash, user_id=user.id, expires_at=now + timedelta(hours=s.session_hours)))
    user.last_login_at = now
    db.commit()
    response.set_cookie(
        s.cookie_name,
        token,
        max_age=s.session_hours * 3600,
        httponly=True,
        secure=s.cookie_secure,
        samesite="strict",
        path="/",
    )
    return user


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    token = request.cookies.get(s.cookie_name)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
        db.commit()
    response.delete_cookie(s.cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/auth/change-password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user = db.merge(user)
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return Response(status_code=204)


# ---- user administration ---------------------------------------------------
@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.username) == body.username.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    u = User(
        username=body.username,
        display_name=body.display_name or body.username,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(u)
    db.commit()
    return u


def _admin_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active)) or 0


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, me_: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = get_or_404(db, User, user_id)
    demoting = (body.role == "viewer" or body.is_active is False) and u.role == "admin" and u.is_active
    if demoting and _admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one active administrator is required")
    if body.display_name is not None:
        u.display_name = body.display_name
    if body.role is not None:
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            db.execute(delete(UserSession).where(UserSession.user_id == u.id))
    if body.password:
        u.password_hash = hash_password(body.password)
        db.execute(delete(UserSession).where(UserSession.user_id == u.id))
    db.commit()
    return u


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, me_: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = get_or_404(db, User, user_id)
    if u.id == me_.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    if u.role == "admin" and u.is_active and _admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "At least one active administrator is required")
    db.delete(u)
    db.commit()
    return Response(status_code=204)
