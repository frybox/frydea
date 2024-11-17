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

def new_changes(user_id, last_clid):
    query = db.select(ChangeLog.card_id, ChangeLog.create_time, ChangeLog.version)
    query = query.where(ChangeLog.user_id == user_id, ChangeLog.id > last_clid)
    query = query.order_by(ChangeLog.id)
    result = {}
    for card_id, create_time, version in db.session.execute(query).all():
        result[card_id] = (create_time, version)
    return [f'{key} {value[0].isoformat()} {value[1]}'
            for key, value in result.items()]

def max_clid():
    query = db.select(ChangeLog.id).order_by(desc(ChangeLog.id)).limit(1)
    return db.session.scalars(query).first()

@app.get('/')
def index():
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id)
    query = query.order_by(desc(Card.id)).limit(5)
    cards = reversed(db.session.scalars(query).all())
    query = db.select(Card.id, Card.create_time).where(Card.user_id == user.id)
    query = query.order_by(Card.id)
    cidtimes = db.session.execute(query).all()
    clid = max_clid()
    args = dict(cards=cards, cidtimes=cidtimes, clid=clid)
    return html(App, args=args, title='Frydea', autoreload=False)

@app.post('/cards')
def create_card():
    user = get_user()
    data = request.get_json()
    content = data['content']
    last_clid = data['last_clid']
    card = Card(user_id=user.id,
                version=1,
                content=content,
                create_time=datetime.now())
    db.session.add(card)
    db.session.flush()
    changelog = ChangeLog(user_id=user.id,
                          card_id=card.id,
                          version=card.version,
                          content=card.content,
                          create_time=card.create_time,
                          update_time=card.update_time)
    db.session.add(changelog)
    db.session.flush()
    changes = new_changes(user.id, last_clid)
    db.session.commit()
    return {
        'code': 0,
        'clid': changelog.id,
        'changes': changes,
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
    last_version = data['last_version']
    last_clid = data['last_clid']
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
        changelog = ChangeLog(user_id=user.id,
                              card_id=card.id,
                              version=card.version,
                              content=card.content,
                              create_time=card.create_time,
                              update_time=card.update_time)
        db.session.add(card)
        db.session.add(changelog)
        changes = new_changes(user.id, last_clid)
        db.session.commit()
    return {
        'code': 0,
        'clid': changelog.id,
        'changes': changes,
        'card': card.todict(),
    }

@app.get('/cards/<int:cid>')
def get_card(cid):
    user = get_user()
    query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    last_clid = request.args.get('last_clid')
    if last_clid is not None:
        last_clid = int(last_clid)
        clid = max_clid()
        changes = new_changes(user.id, last_clid)
        return {
            'code': 0,
            'clid': clid,
            'changes': changes,
            'card': card.todict(),
        }
    else:
        return {
            'code': 0,
            'card': card.todict(),
        }

@app.get('/cards')
def get_card_list():
    user = get_user()
    first_cid = request.args.get('first_cid')
    last_cid = request.args.get('last_cid')
    last_clid = request.args.get('last_clid')
    if None in (first_cid, last_cid):
        abort(404)
    first_cid, last_cid = int(first_cid), int(last_cid)
    query = db.select(Card).where(Card.user_id == user.id, Card.id >= first_cid, Card.id <= last_cid)
    query = query.order_by(Card.id)
    cards = [card.todict() for card in db.session.scalars(query).all()]
    if last_clid is not None:
        last_clid = int(last_clid)
        clid = max_clid()
        changes = new_changes(user.id, last_clid)
        return {
            'code': 0,
            'clid': clid,
            'changes': changes,
            'cards': cards,
        }
    else:
        return {
            'code': 0,
            'cards': cards,
        }

@app.delete('/cards/<int:cid>')
def delete_card(cid):
    user = get_user()
    last_clid = request.args.get('last_clid')
    query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
    card = db.session.scalars(query).first()
    if not card:
        abort(404)
    changelog = ChangeLog(user_id=user.id,
                          card_id=card.id,
                          version=-(card.version+1),
                          content=card.content,
                          update_time=card.update_time)
    db.session.delete(card)
    db.session.add(changelog)
    db.session.commit()
    if last_clid is not None:
        last_clid = int(last_clid)
        changes = new_changes(user.id, last_clid)
        return {
            'code': 0,
            'clid': changelog.id,
            'changes': changes,
        }
    else:
        return {
            'code': 0
        }