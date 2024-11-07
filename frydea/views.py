from datetime import datetime
from flask import abort, request
from fryhcs import html, render
from frydea import app
from frydea.components import App
from frydea.database import db
from frydea.models import Card, User, Version
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
    query = query.order_by(desc(Card.create_time)).limit(10)
    cards = reversed(db.session.scalars(query).all())
    return html(App, args={'cards': cards}, title='Frydea', autoreload=False)

def next_noofday(user):
    def sameday(dt1, dt2):
        return (dt1.year == dt2.year and
                dt1.month == dt2.month and
                dt1.day == dt2.day)
    query = db.select(Card).where(Card.user_id == user.id)
    query = query.order_by(desc(Card.create_time)).limit(1)
    card = db.session.scalars(query).first()
    if not card:
        return 1
    else:
        now = datetime.now()
        if sameday(now, card.create_time):
            return card.noofday + 1
        else:
            return 1

@app.post('/cards')
def create_card():
    user = get_user()
    data = request.get_json()
    create_time = datetime.now()
    noofday = next_noofday(user)
    content = data['content']

    conflict = True

    while conflict:
        card = Card(user_id=user.id,
                    create_time=create_time,
                    noofday=noofday,
                    content=content,
                    version=1,
                    update_time=create_time)
        query = db.select(Card).where(Card.user_id == user.id, Card.number == card.number)
        if db.session.scalars(query).first():
            noofday += 1
        else:
            conflict = False
    db.session.add(card)
    db.session.commit()
    return {
        'code': 0,
        'card': card.todict()
    }

@app.put('/cards/<card_number>')
def update_card(card_number):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.number == card_number)
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
        version = Version(card_id=card.id,
                          content=card.content,
                          version=card.version,
                          update_time=card.update_time)
        card.content = content
        card.version = last_version + 1
        card.update_time = datetime.now()
        db.session.add(version)
        db.session.add(card)
        db.session.commit()
    return {
        'code': 0,
        'card': card.todict(),
    }

@app.get('/cards')
def get_card_list():
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id).order_by(Card.create_time)
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

@app.delete('/cards/<card_number>')
def delete_card(card_number):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.number == card_number)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    db.session.delete(card)
    db.session.commit()
    return {
        'code': 0,
    }