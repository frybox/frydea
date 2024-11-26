from datetime import datetime
from flask import abort, request, url_for, redirect, flash
from flask_login import login_user, login_required, logout_user, current_user
from fryhcs import html
from frydea import app
from frydea import login_manager
from frydea.web import App, Login, Signup
from frydea.database import db
from frydea.models import Card, User, ChangeLog
from sqlalchemy import desc

login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    query = db.select(User).where(User.id == int(user_id))
    user = db.session.scalars(query).first()
    return user

def new_changes(user_id, last_clid):
    query = db.select(ChangeLog.card_id, ChangeLog.create_time, ChangeLog.version)
    query = query.where(ChangeLog.user_id == user_id, ChangeLog.id > last_clid)
    query = query.order_by(ChangeLog.id)
    result = {}
    for card_id, create_time, version in db.session.execute(query).all():
        result[card_id] = (create_time, version)
    return [(key, value[0].isoformat(), value[1])
            for key, value in result.items()]

def max_clid():
    query = db.select(ChangeLog.id).order_by(desc(ChangeLog.id)).limit(1)
    return db.session.scalars(query).first()

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form['username'].strip()
        nickname = request.form['nickname'].strip()
        password = request.form['password'].strip()
        pwconfirm = request.form['password_confirm'].strip()
        if not username or not password:
            flash("用户名/密码不能为空")
            return redirect(url_for('signup'))
        if password != pwconfirm:
            flash("密码不一致")
            return redirect(url_for('signup'))
        query = db.select(User).where(User.username == username)
        if db.session.scalars(query).first():
            flash("用户名已存在")
            return redirect(url_for('signup'))
        user = User(username, nickname)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return redirect(url_for('index'))
    return html(Signup, title="Frydea login", autoreload=False)


@app.route('/login', methods=['GET', 'POST'])
def login():
    args = {}
    next_url = request.args.get('next')
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password'].strip()
        if not username or not password:
            flash("用户名/密码不能为空")
            return redirect(url_for('login'))
        query = db.select(User).where(User.username == username)
        user = db.session.scalars(query).first()
        if user and user.validate_password(password):
            login_user(user)
            flash("登录成功")
            return redirect(next_url or url_for('index'))
        flash("用户名/密码错误")
        args = dict(username=username)
    return html(Login, args=args, title="Frydea login", autoreload=False)


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))


@app.get('/')
@login_required
def index():
    user = current_user 
    query = db.select(Card).where(Card.user_id == user.id)
    query = query.order_by(desc(Card.id)).limit(5)
    cards = reversed(db.session.scalars(query).all())
    query = db.select(Card.id, Card.create_time).where(Card.user_id == user.id)
    query = query.order_by(Card.id)
    cidtimes = db.session.execute(query).all()
    clid = max_clid()
    args = dict(user=user, cards=cards, cidtimes=cidtimes, clid=clid)
    return html(App, args=args, title='Frydea', autoreload=False)

@app.post('/cards')
@login_required
def create_card():
    user = current_user 
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
@login_required
def update_card(cid):
    user = current_user 
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
@login_required
def get_card(cid):
    """
    获取指定cid的卡片。
    在cid为0的特殊情况下，不会获取card，只用来检查服务器是否有新的更新。
    """
    user = current_user 
    if cid == 0:
        result = dict(code=0)
    else:
        query = db.select(Card).where(Card.user_id == user.id, Card.id == cid)
        card = db.session.scalars(query).first()
        if not card:
            abort(404)
        result = dict(code=0, card=card.todict())
    last_clid = request.args.get('last_clid')
    if last_clid is not None:
        last_clid = int(last_clid)
        clid = max_clid()
        changes = new_changes(user.id, last_clid)
        result.update({}, clid=clid, changes=changes)
    return result


@app.get('/cards')
@login_required
def get_card_list():
    user = current_user 
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
@login_required
def delete_card(cid):
    user = current_user 
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