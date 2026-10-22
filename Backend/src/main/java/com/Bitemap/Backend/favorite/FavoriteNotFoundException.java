package com.Bitemap.Backend.favorite;

/** The truck to save does not exist. */
public class FavoriteNotFoundException extends RuntimeException {
	public FavoriteNotFoundException() {
		super("Truck not found.");
	}
}
