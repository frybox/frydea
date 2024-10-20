from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from frydea.database import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True)
    email = Column(String(120), unique=True)

    cards = relationship('Card', back_populates='user')

    def __init__(self, name=None, email=None):
        self.name = name
        self.email = email

    def __repr__(self):
        return f'<User {self.name!r}>'


class Card(Base):
    __tablename__ = 'cards'
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    name = Column(String, nullable=True)
    create_time = Column(DateTime, default=datetime.utcnow, comment='card创建时间')
    noofday = Column(Integer, nullable=False, comment='创建当天编号')
    content = Column(Text, nullable=False, comment='Markdown内容')
    html = Column(Text, nullable=False, comment='渲染后的HTML内容')
    version = Column(Integer, default=1, comment='版本号')
    vtime = Column(DateTime, default=datetime.utcnow, comment='当前版本创建时间')

    user = relationship('User', back_populates='cards')
    history = relationship('History', back_populates='card')

    #def __init__(self, name=None):
    #    self.name = name

    def __repr__(self):
        return f'<Card {self.name!r}>'


class History(Base):
    __tablename__ = 'history'
    id = Column(Integer, primary_key=True, autoincrement=True)
    card_id = Column(Integer, ForeignKey('cards.id'))
    card = relationship('Card', back_populates='history')
    name = Column(String, nullable=True)
    content = Column(Text, nullable=False, comment='Markdown内容')
    version = Column(Integer, default=1, comment='版本号')
    vtime = Column(DateTime, default=datetime.utcnow, comment='当前版本创建时间')

    #def __init__(self, name=None):
    #    self.name = name

    def __repr__(self):
        return f'<History {self.name!r}>'