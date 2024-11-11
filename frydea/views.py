from datetime import datetime
from flask import abort, request
from fryhcs import html, render
from frydea import app
from frydea.web import App
from frydea.database import db
from frydea.models import Card, User, ChangeLog
from sqlalchemy import desc

def get_user():
    user = db.session.get(User, 1)
    if not user:
        user = User(name="admin", email="admin@frydea.org")
        db.session.add(user)
        db.session.commit()
    return user

@app.get('/')
def index():
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id)
    query = query.order_by(desc(Card.id)).limit(10)
    cards = reversed(db.session.scalars(query).all())
    query = db.select(Card.id).where(Card.user_id == user.id, Card.version > 0)
    query = query.order_by(Card.id)
    cids = db.session.scalars(query).all()
    query = db.select(ChangeLog.id).order_by(desc(ChangeLog.id)).limit(1)
    clid = db.session.scalars(query).first()
    args = dict(cards=cards, cids=cids, clid=clid)
    return html(App, args=args, title='Frydea', autoreload=False)

@app.post('/cards')
def create_card():
    user = get_user()
    data = request.get_json()
    content = data['content']
    card = Card(user_id=user.id,
                version=1,
                content=content,
                update_time=datetime.now())
    db.session.add(card)
    db.session.flush()
    changelog = ChangeLog(card_id=card.id,
                        content=card.content,
                        version=card.version,
                        update_time=card.update_time)
    db.session.add(changelog)
    db.session.commit()
    return {
        'code': 0,
        'card': card.todict()
    }

@app.put('/cards/<int:cid>')
def update_card(cid):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    data = request.get_json()
    content = data['content']
    last_version = int(data['last_version'])
    if last_version > card.version:
        return {
            'code': 1,
            'msg': 'invalid version',
            'card': card.todict(),
        }
    elif last_version < card.version:
        return {
            'code': 2,
            'msg': 'conflict version',
            'card': card.todict(),
        }
    if content != card.content:
        card.content = content
        card.version = last_version + 1
        card.update_time = datetime.now()
        changelog = ChangeLog(card_id=card.id,
                          content=card.content,
                          version=card.version,
                          update_time=card.update_time)
        db.session.add(changelog)
        db.session.add(card)
        db.session.commit()
    return {
        'code': 0,
        'card': card.todict(),
    }

@app.get('/cards/<int:cid>')
def get_card(cid):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    return {
        'code': 0,
        'card': card.todict(),
    }

@app.get('/cards')
def get_card_list():
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id).order_by(Card.id)
    page = db.paginate(query)
    return {
        'code': 0,
        'total': page.total,
        'first_number': page.first,
        'last_number': page.last,
        'pages': page.pages,
        'page': page.page,
        'per_page': page.per_page,
        'cards': [card.todict() for card in page]
    }

@app.delete('/cards/<int:cid>')
def delete_card(cid):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    db.session.delete(card)
    db.session.commit()
    return {
        'code': 0,
    }