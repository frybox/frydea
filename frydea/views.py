from fryhcs import html, render
from frydea import app
from frydea.components import App
from frydea.database import db
from frydea.models import Card, User, History

import markdown

def get_user():
    pass

@app.get('/')
def index():
    return html(App, title='Frydea', autoreload=False)

@app.post('/cards')
def create_card():
    user = get_user()
    form = request.form
    name = form['name']
    create_time = datetime.now()
    noofday = db.select(Card).where(Card.user_id == user.id).count()
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
        'card': {
            'id': card.id,
            'number': card.number,
            'user_id': card.user_id,
            'name': card.name,
            'create_time': card.create_time,
            'content': card.content,
            'html': card.html,
            'version': card.version,
            'update_time': card.update_time,
        }
    }

@app.put('/cards/<int:card_id>')
def update_card(card_id):
    user = get_user()
    card = db.get_or_404(Card, card_id)
    form = request.form
    name = form['name']
    if name and name != card.name:
        card.name = name
    content = form['content']
    if content != card.content:
        card.content = content
        card.html = markdown.markdown(content)

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
        'card': {
            'id': card.id,
            'number': card.number,
            'user_id': card.user_id,
            'name': card.name,
            'create_time': card.create_time,
            'content': card.content,
            'html': card.html,
            'version': card.version,
            'update_time': card.update_time,
        }
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
        'items': [{
            'number': item.number,
            'name': item.name,
            'create_time': item.create_time,
            'content': item.content,
            'html': item.html,
            'version': item.version,
            'update_time': item.update_time,
        } for item in page]
    }

@app.delete('/cards/<int:card_id>')
def delete_card(card_id):
    card = db.get_or_404(Card, card_id)
    db.session.delete(card)
    db.session.commit()
    return {
        'code': 0,
    }