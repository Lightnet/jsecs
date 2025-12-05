// sample test

import ECS, { Entity, Component, defineComponent, System } from "../src/jsecs.js";
import { GUI } from 'https://unpkg.com/three@0.181.2/examples/jsm/libs/lil-gui.module.min.js';

// console.log(ECS);
const ecs = new ECS();
console.log(ecs);

// Does not work here for browser.
// @Component
// class Position{
//     static defaults = { x: 0, y: 0 };
// }

const Position = defineComponent(class {
  x = 0
  y = 0
});

const Velocity = defineComponent(class {
  x = 0
  y = 0
});
// const Renderable = defineComponent(class {});

// System: Moves entities with Position + Velocity
class MovementSystem extends System {
  constructor() {
    super([Position.type, Velocity.type], 60); // 60 FPS max
  }

  update(time, delta, entity) {
    console.log("player update...");
    const pos = Position.oneFrom(entity).data;
    const vel = Velocity.oneFrom(entity).data;

    // Guard clause — exit early if missing required components
    if (!pos || !vel) return;

    pos.x += vel.x * (delta / 1000);
    pos.y += vel.y * (delta / 1000);
    // console.log("pos.x: ", pos.x);
  }
}

class TestSystem extends System {
  constructor() {
    super([-1], 10); // runs on ALL entities, 10 times/sec
  }

  update(time, delta, entity) {
    // console.log("test update...");
  }
}

// Create player entity
const player = new Entity();
const unsubscribe_player = player.subscribe((entity, added, remove)=>{//this check component add and remove
  console.log("Something changed on player!", added || remove);
  console.log(entity === player);
});

player.add(new Position({ x: 100, y: 200 }));  // x and y are set here!
player.add(new Velocity({ x: 150, y: 0 }));

ecs.addEntity(player);
console.log("player.id: ", player.id);

const cubeEnt = new Entity();
const cancel_sub = cubeEnt.subscribe((entity)=>{
    console.log("subscribe");
    console.log(entity === cubeEnt);
});
ecs.addEntity(cubeEnt);
console.log("cubeEnt.id: ", cubeEnt.id);

setTimeout(() => {
  unsubscribe_player();  // ← Clean up! No more logs
  console.log("Stopped watching player");
}, 5000);

// ecs.removeEntity();
// setTimeout(function() {
//   ecs.removeEntity(player);
// }, 2000);

ecs.addSystem(new TestSystem());
ecs.addSystem(new MovementSystem());

// Game loop
function gameLoop() {
    console.log("loop");
    ecs.update();
    requestAnimationFrame(gameLoop);
}

gameLoop();

let obj = {
	myBoolean: true,
	myString: 'lil-gui',
	myNumber: 1,
	addentity: function() { 
        console.log("added...")
        const newplayer = new Entity();
        newplayer.add(new Position({ x: 100, y: 200 }));  // x and y are set here!
        newplayer.add(new Velocity({ x: 150, y: 0 }));
        ecs.addEntity(newplayer);
    },
	myFunction: function() { 
        console.log('test');
        cancel();
    },
    remove_pos: function() { 
        console.log('remove...');
        const currentPosComponent = Position.oneFrom(player);
        if (currentPosComponent) {
            player.remove(currentPosComponent);
        }
    },

    add_pos: function() { 
        console.log('add...');
        const currentPosComponent = Position.oneFrom(player);
        if (!currentPosComponent) {
            player.add(new Position({ x: 100, y: 200 }));
        }
    }
}

const gui = new GUI();
gui.add( document, 'title' );
gui.add( obj, 'addentity' ); 	// button
gui.add( obj, 'myFunction' ); 	// button
gui.add( obj, 'remove_pos' ); 	// button
gui.add( obj, 'add_pos' ); 	// button

console.log("TEST");
