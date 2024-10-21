from flask import abort
from fryhcs import html, render
from frydea import app
from frydea.components import App
from frydea.database import db
from frydea.models import Card, User, Version

import markdown

def get_user():
    user = db.select(User).where(User.id==1).first()
    if not user:
        user = User(id=1, name="admin", email="admin@frydea.org")
        db.session.add(user)
        db.session.commit()
    return user

@app.get('/')
def index():
    return html(App, title='Frydea', autoreload=False)

@app.post('/cards')
def create_card():
    user = get_user()
    form = request.form
    name = form['name']
    create_time = datetime.now()
    noofday = db.select(Card).where(Card.user_id == user.id).count() + 1
    content = form['content']
    html = markdown.markdown(content)

    card = Card(user_id=user.id,
                name=name,
                create_time=create_time,
                noofday=noofday,
                content=content,
                html=html,
                version=1,
                update_time=create_time)
    db.session.add(card)
    db.session.commit()
    return {
        'code': 0,
        'card': card.todict()
    }

@app.put('/cards/<int:card_id>')
def update_card(card_id):
    user = get_user()
    card = db.get_or_404(Card, card_id)
    if card.user_id != user.id:
        abort(403)
    form = request.form
    name = form['name']
    content = form['content']
    last_version = int(form['last_version'])
    if last_version > card.version:
        return {
            'code': 1,
            'msg': 'invalid version',
            'last_version': card.version,
        }
    elif last_version < card.version:
        return {
            'code': 2,
            'msg': 'new version',
            'card': card.todict(),
        }
    diffname = name and name != card.name
    diffcontent = content != card.content
    if diffname or diffcontent:
        version = Version(card_id=card.id,
                          name=card.name,
                          content=card.content,
                          version=card.version,
                          update_time=card.update_time)
        if diffname:
            card.name = name
        if diffcontent:
            card.content = content
            card.html = markdown.markdown(content)
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
        'pages': page.pages,
        'page': page.page,
        'per_page': page.per_page,
        'cards': [{
            'number': card.number,
            'name': card.name,
            'create_time': card.create_time,
            'content': card.content,
            'html': card.html,
            'version': card.version,
            'update_time': card.update_time,
        } for card in page]
    }

@app.delete('/cards/<int:card_id>')
def delete_card(card_id):
    card = db.get_or_404(Card, card_id)
    db.session.delete(card)
    db.session.commit()
    return {
        'code': 0,
    }