import math
from abc import ABC, abstractmethod

def square_area(side : float) -> float : 
    return side**2

def circle_area_by_rasius(radius : float) -> float :
    return math.pi * radius **2


#abstract base
class Shape(ABC):
    @abstractmethod
    def area(self) -> float:
        pass
    
    
class Circle(Shape):
    radius : float
    
    def __str__(self) :
        return f"[a circle with radius {self.radius}]"
    
    def __init__(self, radius :float = 0):
        self.radius = radius
        
    def area(self) -> float:
        return circle_area_by_rasius(self.radius)
    
class Square(Shape):
    side : float
    
    def __str__(self) :
        return f"[a square with side {self.side}]"
    
    def __init__(self, side :float = 0):
        self.side = side
        
    def area(self) -> float:
        return square_area(self.side)
    


def print_shape(shape : Shape):
    print(shape, " area is ", shape.area())
    



#############################################################################################
print("======================")

res = square_area(10)
print(res)

res = circle_area_by_rasius(10)
print(res)

#############################################################################################
print("======================")
c1 = Circle()
c2 = Circle(10)
print(c1, "area is ", c1.area())
print(c2, "area is ", c2.area())

s1 = Square()
s2 = Square(10)
print(s1, "area is ", s1.area())
print(s2, "area is ", s2.area())

print("======================")
print_shape(c1)
print_shape(c2)
print_shape(s1)
print_shape(s2)

#############################################################################################
print("--------------------------------------------")

list1 = [c1,s1,c2,s2, Circle(5)]

for s in list1:
    print_shape(s)




